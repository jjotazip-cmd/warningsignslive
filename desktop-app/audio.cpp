// Windows Core Audio bridge. stdout carries session records or interleaved PCM.
#include <windows.h>
#include <mmdeviceapi.h>
#include <audioclient.h>
#include <audioclientactivationparams.h>
#include <audiopolicy.h>
#include <tlhelp32.h>
#include <wrl.h>
#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <fcntl.h>
#include <io.h>
#include <map>
#include <set>
#include <string>
#include <vector>
using namespace Microsoft::WRL;
static void check(HRESULT hr) { if (FAILED(hr)) throw hr; }

struct Process { DWORD parent; std::wstring name; };
using Processes = std::map<DWORD, Process>;
static Processes processes() {
    Processes table;
    HANDLE snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    if (snap == INVALID_HANDLE_VALUE) throw HRESULT_FROM_WIN32(GetLastError());
    PROCESSENTRY32W row{sizeof(row)};
    if (Process32FirstW(snap, &row)) do {
        table.emplace(row.th32ProcessID, Process{row.th32ParentProcessID, row.szExeFile});
    } while (Process32NextW(snap, &row));
    CloseHandle(snap);
    return table;
}
static DWORD appRoot(DWORD pid, const Processes& table) {
    std::set<DWORD> seen;
    while (seen.insert(pid).second) {
        auto child = table.find(pid);
        if (child == table.end()) break;
        auto parent = table.find(child->second.parent);
        if (parent == table.end() || _wcsicmp(parent->second.name.c_str(),child->second.name.c_str())) break;
        pid = parent->first;
    }
    return pid;
}
static void listSessions(const std::set<DWORD>& blocked) {
    auto table = processes();
    std::set<DWORD> listed;
    ComPtr<IMMDeviceEnumerator> devices;
    check(CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL, IID_PPV_ARGS(&devices)));
    ComPtr<IMMDeviceCollection> endpoints;
    check(devices->EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE, &endpoints));
    UINT count; check(endpoints->GetCount(&count));
    for (UINT i=0; i<count; ++i) {
        ComPtr<IMMDevice> device;
        ComPtr<IAudioSessionManager2> manager;
        ComPtr<IAudioSessionEnumerator> sessions;
        if (FAILED(endpoints->Item(i,&device)) ||
            FAILED(device->Activate(__uuidof(IAudioSessionManager2),CLSCTX_ALL,nullptr,reinterpret_cast<void**>(manager.GetAddressOf()))) ||
            FAILED(manager->GetSessionEnumerator(&sessions))) continue;
        int size; if (FAILED(sessions->GetCount(&size))) continue;
        for (int j=0; j<size; ++j) {
            ComPtr<IAudioSessionControl> control; ComPtr<IAudioSessionControl2> detail;
            DWORD pid=0; AudioSessionState state;
            if (FAILED(sessions->GetSession(j,&control)) || FAILED(control.As(&detail)) ||
                FAILED(control->GetState(&state)) || state==AudioSessionStateExpired ||
                FAILED(detail->GetProcessId(&pid)) || !pid) continue;
            DWORD ancestor=pid;
            std::set<DWORD> lineage;
            while (ancestor && !blocked.count(ancestor) && table.count(ancestor) && lineage.insert(ancestor).second)
                ancestor=table.at(ancestor).parent;
            if (blocked.count(ancestor)) continue;
            pid=appRoot(pid,table);
            if (!listed.insert(pid).second || !table.count(pid)) continue;
            const auto& name=table.at(pid).name;
            char utf8[2048]={}; WideCharToMultiByte(CP_UTF8,0,name.c_str(),-1,utf8,sizeof(utf8),nullptr,nullptr);
            printf("%lu\t%s\n",pid,utf8);
        }
    }
}
class Activation final : public RuntimeClass<RuntimeClassFlags<ClassicCom>,
        IActivateAudioInterfaceCompletionHandler,FtmBase> {
public:
    HANDLE ready=CreateEvent(nullptr,TRUE,FALSE,nullptr);
    HRESULT result=E_FAIL;
    ComPtr<IAudioClient> client;
    ~Activation() { if(ready) CloseHandle(ready); }
    HRESULT STDMETHODCALLTYPE ActivateCompleted(IActivateAudioInterfaceAsyncOperation* op) override {
        ComPtr<IUnknown> object;
        HRESULT status=op->GetActivateResult(&result,&object);
        if (FAILED(status)) result=status;
        if (SUCCEEDED(result)) result=object.As(&client);
        SetEvent(ready);
        return S_OK;
    }
};
static void capture(DWORD pid,bool include) {
    AUDIOCLIENT_ACTIVATION_PARAMS params{};
    params.ActivationType=AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK;
    params.ProcessLoopbackParams.TargetProcessId=pid;
    params.ProcessLoopbackParams.ProcessLoopbackMode=include ? PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE : PROCESS_LOOPBACK_MODE_EXCLUDE_TARGET_PROCESS_TREE;
    PROPVARIANT prop{}; prop.vt=VT_BLOB;
    prop.blob.cbSize=sizeof(params); prop.blob.pBlobData=reinterpret_cast<BYTE*>(&params);
    auto completion=Make<Activation>(); if(!completion || !completion->ready) throw E_OUTOFMEMORY;
    ComPtr<IActivateAudioInterfaceAsyncOperation> operation;
    check(ActivateAudioInterfaceAsync(VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK,__uuidof(IAudioClient),&prop,completion.Get(),&operation));
    if (WaitForSingleObject(completion->ready,6000)!=WAIT_OBJECT_0) throw HRESULT_FROM_WIN32(ERROR_TIMEOUT);
    check(completion->result);
    WAVEFORMATEX format{WAVE_FORMAT_PCM,2,44100,176400,4,16,0};
    auto client=completion->client;
    check(client->Initialize(AUDCLNT_SHAREMODE_SHARED,AUDCLNT_STREAMFLAGS_LOOPBACK|AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM,200000,0,&format,nullptr));
    ComPtr<IAudioCaptureClient> reader;
    check(client->GetService(IID_PPV_ARGS(&reader)));
    _setmode(_fileno(stdout),_O_BINARY);
    check(client->Start());
    fputs("READY\n",stderr); fflush(stderr);
    std::vector<BYTE> silence;
    for (;;) {
        UINT32 frames; check(reader->GetNextPacketSize(&frames));
        if (!frames) { Sleep(5); continue; }
        BYTE* data; DWORD flags;
        check(reader->GetBuffer(&data,&frames,&flags,nullptr,nullptr));
        size_t length=size_t(frames)*format.nBlockAlign;
        if(flags&AUDCLNT_BUFFERFLAGS_SILENT){silence.assign(length,0);data=silence.data();}
        bool sent=fwrite(data,1,length,stdout)==length && fflush(stdout)==0;
        check(reader->ReleaseBuffer(frames));
        if(!sent) break;
    }
}
int wmain(int argc,wchar_t** argv) {
    try {
        check(CoInitializeEx(nullptr,COINIT_MULTITHREADED));
        std::wstring mode=argc>1?argv[1]:L"";
        if(mode==L"sessions") {
            std::set<DWORD> blocked;
            for(int i=2;i<argc;++i) blocked.insert(wcstoul(argv[i],nullptr,10));
            listSessions(blocked);
        }
        else if(argc==3 && mode==L"window") {
            DWORD pid=0; GetWindowThreadProcessId(reinterpret_cast<HWND>(_wcstoui64(argv[2],nullptr,10)),&pid);
            printf("%lu\n",appRoot(pid,processes()));
        } else if(argc==3 && (mode==L"include"||mode==L"exclude")) {
            DWORD pid=wcstoul(argv[2],nullptr,10); if(!pid) return 2;
            capture(pid,mode==L"include");
        } else return 2;
        CoUninitialize(); return 0;
    } catch(HRESULT hr) { fprintf(stderr,"Windows Core Audio 0x%08lX\n",(unsigned long)hr); return 1; }
}
