import { ReactNode, useState } from 'react';
import {
  LayoutDashboard,
  Upload,
  Download,
  Settings,
  File,
  Image as ImageIcon,
  Clipboard
} from "lucide-react";

const EphemeraApp = () => {
  const [activeTab, setActiveTab] = useState("stash");
  const [files, _setFiles] = useState([
    { id: 1, name: "document.pdf", type: "pdf", size: "2.4 MB", date: "2023-05-15" },
    { id: 2, name: "screenshot.png", type: "image", size: "1.2 MB", date: "2023-05-14" },
    { id: 3, name: "notes.txt", type: "text", size: "12 KB", date: "2023-05-13" },
  ]);

  return (
    <div className="flex h-screen bg-gray-50 text-gray-800 overflow-hidden w-full">
      {/* 左侧导航栏 - 带背景图 */}
      <aside className="w-64 bg-cover bg-center relative" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1639762681057-408e52192e55?q=80&w=2232&auto=format&fit=crop')" }}>
        <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
        <div className="relative z-10 h-full flex flex-col p-4">
          <div className="mb-8 pt-4">
            <h1 className="text-2xl font-bold text-white">Ephemera</h1>
            <p className="text-sm text-white/80">Temporary storage & transfer</p>
          </div>

          <nav className="flex-1">
            <ul className="space-y-2">
              <NavItem
                icon={<LayoutDashboard size={18} />}
                active={activeTab === "stash"}
                onClick={() => setActiveTab("stash")}
              >
                Stash Area
              </NavItem>
              <NavItem
                icon={<Upload size={18} />}
                active={activeTab === "upload"}
                onClick={() => setActiveTab("upload")}
              >
                Send Files
              </NavItem>
              <NavItem
                icon={<Download size={18} />}
                active={activeTab === "receive"}
                onClick={() => setActiveTab("receive")}
              >
                Receive Files
              </NavItem>
              <NavItem
                icon={<Settings size={18} />}
                active={activeTab === "settings"}
                onClick={() => setActiveTab("settings")}
              >
                Settings
              </NavItem>
            </ul>
          </nav>

          <div className="text-xs text-white/50 mt-auto">
            <p>v1.0.0</p>
          </div>
        </div>
      </aside>

      {/* 主内容区 */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* 顶部工具栏 */}
        <header className="bg-white border-b px-6 py-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold capitalize">{activeTab}</h2>
          <div className="flex items-center space-x-3">
            <button className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors">
              New Transfer
            </button>
          </div>
        </header>

        {/* 内容区域 */}
        <div className="flex-1 flex overflow-hidden">
          {/* 中间暂存区 */}
          <section className={`w-1/2 border-r overflow-auto p-6 ${activeTab !== "stash" && "hidden"}`}>
            <div className="grid grid-cols-1 gap-4">
              {files.map(file => (
                <FileCard key={file.id} file={file} />
              ))}
            </div>
          </section>

          {/* 传输/设置区域 */}
          <section className={`flex-1 overflow-auto p-6 ${activeTab === "stash" && "w-1/2"}`}>
            {activeTab === "stash" && (
              <div>
                <h3 className="text-lg font-medium mb-4">File Details</h3>
                <div className="bg-white rounded-lg border p-4">
                  <p>Select a file to view details</p>
                </div>
              </div>
            )}

            {activeTab === "upload" && (
              <div className="h-full flex flex-col">
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center bg-gray-50 flex-1 flex flex-col items-center justify-center">
                  <Upload size={48} className="text-gray-400 mb-4" />
                  <p className="text-gray-500 mb-2">Drag and drop files here</p>
                  <p className="text-sm text-gray-400 mb-4">or</p>
                  <button className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors">
                    Browse Files
                  </button>
                </div>
                <div className="mt-4">
                  <h3 className="font-medium mb-2">Recent Transfers</h3>
                  <div className="space-y-2">
                    <TransferItem name="Project.zip" status="Completed" />
                    <TransferItem name="Presentation.pdf" status="Failed" />
                  </div>
                </div>
              </div>
            )}

            {activeTab === "receive" && (
              <div className="h-full flex flex-col items-center justify-center">
                <div className="bg-white rounded-lg border p-6 max-w-md w-full text-center">
                  <div className="bg-blue-100 text-blue-800 rounded-full w-32 h-32 flex items-center justify-center mx-auto mb-6">
                    <Download size={48} />
                  </div>
                  <h3 className="text-xl font-medium mb-2">Ready to Receive</h3>
                  <p className="text-gray-600 mb-6">Enter the transfer code to start receiving files</p>
                  <div className="flex space-x-2 mb-4">
                    <input
                      type="text"
                      placeholder="Enter code"
                      className="flex-1 border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors">
                      Connect
                    </button>
                  </div>
                  <p className="text-sm text-gray-500">Or share your device ID to receive files</p>
                </div>
              </div>
            )}

            {activeTab === "settings" && (
              <div className="max-w-2xl">
                <h3 className="text-lg font-medium mb-6">Application Settings</h3>

                <div className="space-y-6">
                  <SettingSection title="Storage">
                    <div className="space-y-4">
                      <SettingItem
                        title="Temporary Storage Location"
                        description="Where ephemeral files are stored"
                      >
                        <input
                          type="text"
                          value="/var/ephemera/storage"
                          className="w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </SettingItem>
                      <SettingItem
                        title="Auto-clear Interval"
                        description="How long to keep files before automatic deletion"
                      >
                        <select className="w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                          <option>24 hours</option>
                          <option>1 week</option>
                          <option>1 month</option>
                        </select>
                      </SettingItem>
                      <SettingItem
                        title="Quote"
                        description="设置配额"
                      >
                        10 GB
                      </SettingItem>
                    </div>
                  </SettingSection>

                  <SettingSection title="Transfer">
                    <div className="space-y-4">
                      <SettingItem
                        title="Default Transfer Mode"
                        description="Preferred method for sending files"
                      >
                        <div className="flex items-center space-x-4">
                          <label className="flex items-center">
                            <input type="radio" name="transfer-mode" className="mr-2" checked />
                            WebRTC (Direct)
                          </label>
                          <label className="flex items-center">
                            <input type="radio" name="transfer-mode" className="mr-2" />
                            WebSocket (Relay)
                          </label>
                        </div>
                      </SettingItem>
                    </div>
                  </SettingSection>
                </div>

                <h3 className="text-lg font-medium mb-6">Authorization</h3>
                <div className="space-y-6">
                  <SettingSection title="Secret">
                    <div className="space-y-4">
                      <SettingItem
                        title="设置密钥"
                        description="Preferred method for sending files"
                      >
                        <div className="flex items-center space-x-4">
                          <label className="flex items-center">
                            <input type="radio" name="transfer-mode" className="mr-2" checked />
                            WebRTC (Direct)
                          </label>
                          <label className="flex items-center">
                            <input type="radio" name="transfer-mode" className="mr-2" />
                            WebSocket (Relay)
                          </label>
                        </div>
                      </SettingItem>
                    </div>
                  </SettingSection>
                </div>

                <h3 className="text-lg font-medium mb-6">Device</h3>
                <div className="space-y-6">
                  <SettingSection title="Tags">
                    <div className="space-y-4">
                      <SettingItem
                        title="设备标签"
                        description="Preferred method for sending files"
                      >
                        <div className="flex items-center space-x-4">
                          <label className="flex items-center">
                            <input type="radio" name="transfer-mode" className="mr-2" checked />
                            WebRTC (Direct)
                          </label>
                          <label className="flex items-center">
                            <input type="radio" name="transfer-mode" className="mr-2" />
                            WebSocket (Relay)
                          </label>
                        </div>
                      </SettingItem>
                    </div>
                  </SettingSection>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
};

// 组件辅助部分
const NavItem = ({ icon, children, active, onClick }: {
  icon: ReactNode;
  children: ReactNode;
  active: boolean;
  onClick: () => void;
}) => (
  <li>
    <button
      onClick={onClick}
      className={`w-full flex items-center space-x-3 px-3 py-2 rounded-md transition-colors ${active ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/5 hover:text-white"}`}
    >
      <span className={`${active ? "text-blue-400" : "text-white/50"}`}>{icon}</span>
      <span>{children}</span>
    </button>
  </li>
);

const FileCard = ({ file }: { file: { id: number; name: string; type: string; size: string; date: string } }) => {
  const getIcon = () => {
    switch(file.type) {
      case "pdf": return <File className="text-red-500" />;
      case "image": return <ImageIcon className="text-green-500" />;
      default: return <Clipboard className="text-blue-500" />;
    }
  };

  return (
    <div className="bg-white rounded-lg border p-4 hover:shadow-sm transition-shadow cursor-pointer">
      <div className="flex items-start space-x-3">
        <div className="p-2 bg-gray-100 rounded-md">
          {getIcon()}
        </div>
        <div className="flex-1">
          <h3 className="font-medium truncate">{file.name}</h3>
          <div className="flex justify-between text-sm text-gray-500 mt-1">
            <span>{file.size}</span>
            <span>{file.date}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const TransferItem = ({ name, status }: { name: string; status: string }) => {
  const statusColor = status === "Completed" ? "text-green-600" : "text-red-600";

  return (
    <div className="bg-white rounded-lg border p-3 flex items-center justify-between">
      <div className="flex items-center space-x-3">
        <File size={18} className="text-gray-400" />
        <span className="truncate">{name}</span>
      </div>
      <span className={`text-sm ${statusColor}`}>{status}</span>
    </div>
  );
};

const SettingSection = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="border-b pb-6">
    <h4 className="text-lg font-medium mb-4">{title}</h4>
    {children}
  </div>
);

const SettingItem = ({ title, description, children }: {
  title: string;
  description: string;
  children: ReactNode;
}) => (
  <div>
    <h5 className="font-medium mb-1">{title}</h5>
    <p className="text-sm text-gray-600 mb-2">{description}</p>
    {children}
  </div>
);

export default EphemeraApp;