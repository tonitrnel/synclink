import { ReactNode, useState } from 'react';
import {
    LayoutDashboard,
    Upload,
    Download,
    Settings,
    File,
    Image as ImageIcon,
    Clipboard,
} from 'lucide-react';

const EphemeraApp = () => {
    const [activeTab, setActiveTab] = useState('stash');
    const [files, _setFiles] = useState([
        {
            id: 1,
            name: 'document.pdf',
            type: 'pdf',
            size: '2.4 MB',
            date: '2023-05-15',
        },
        {
            id: 2,
            name: 'screenshot.png',
            type: 'image',
            size: '1.2 MB',
            date: '2023-05-14',
        },
        {
            id: 3,
            name: 'notes.txt',
            type: 'text',
            size: '12 KB',
            date: '2023-05-13',
        },
    ]);

    return (
        <div className="flex h-screen w-full overflow-hidden bg-gray-50 text-gray-800">
            {/* 左侧导航栏 - 带背景图 */}
            <aside
                className="relative w-64 bg-cover bg-center"
                style={{
                    backgroundImage:
                        "url('https://images.unsplash.com/photo-1639762681057-408e52192e55?q=80&w=2232&auto=format&fit=crop')",
                }}
            >
                <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
                <div className="relative z-10 flex h-full flex-col p-4">
                    <div className="mb-8 pt-4">
                        <h1 className="text-2xl font-bold text-white">
                            Ephemera
                        </h1>
                        <p className="text-sm text-white/80">
                            Temporary storage & transfer
                        </p>
                    </div>

                    <nav className="flex-1">
                        <ul className="space-y-2">
                            <NavItem
                                icon={<LayoutDashboard size={18} />}
                                active={activeTab === 'stash'}
                                onClick={() => setActiveTab('stash')}
                            >
                                Stash Area
                            </NavItem>
                            <NavItem
                                icon={<Upload size={18} />}
                                active={activeTab === 'upload'}
                                onClick={() => setActiveTab('upload')}
                            >
                                Send Files
                            </NavItem>
                            <NavItem
                                icon={<Download size={18} />}
                                active={activeTab === 'receive'}
                                onClick={() => setActiveTab('receive')}
                            >
                                Receive Files
                            </NavItem>
                            <NavItem
                                icon={<Settings size={18} />}
                                active={activeTab === 'settings'}
                                onClick={() => setActiveTab('settings')}
                            >
                                Settings
                            </NavItem>
                        </ul>
                    </nav>

                    <div className="mt-auto text-xs text-white/50">
                        <p>v1.0.0</p>
                    </div>
                </div>
            </aside>

            {/* 主内容区 */}
            <main className="flex flex-1 flex-col overflow-hidden">
                {/* 顶部工具栏 */}
                <header className="flex items-center justify-between border-b bg-white px-6 py-3">
                    <h2 className="text-lg font-semibold capitalize">
                        {activeTab}
                    </h2>
                    <div className="flex items-center space-x-3">
                        <button className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white transition-colors hover:bg-blue-700">
                            New Transfer
                        </button>
                    </div>
                </header>

                {/* 内容区域 */}
                <div className="flex flex-1 overflow-hidden">
                    {/* 中间暂存区 */}
                    <section
                        className={`w-1/2 overflow-auto border-r p-6 ${activeTab !== 'stash' && 'hidden'}`}
                    >
                        <div className="grid grid-cols-1 gap-4">
                            {files.map((file) => (
                                <FileCard key={file.id} file={file} />
                            ))}
                        </div>
                    </section>

                    {/* 传输/设置区域 */}
                    <section
                        className={`flex-1 overflow-auto p-6 ${activeTab === 'stash' && 'w-1/2'}`}
                    >
                        {activeTab === 'stash' && (
                            <div>
                                <h3 className="mb-4 text-lg font-medium">
                                    File Details
                                </h3>
                                <div className="rounded-lg border bg-white p-4">
                                    <p>Select a file to view details</p>
                                </div>
                            </div>
                        )}

                        {activeTab === 'upload' && (
                            <div className="flex h-full flex-col">
                                <div className="flex flex-1 flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-8 text-center">
                                    <Upload
                                        size={48}
                                        className="mb-4 text-gray-400"
                                    />
                                    <p className="mb-2 text-gray-500">
                                        Drag and drop files here
                                    </p>
                                    <p className="mb-4 text-sm text-gray-400">
                                        or
                                    </p>
                                    <button className="rounded-md bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700">
                                        Browse Files
                                    </button>
                                </div>
                                <div className="mt-4">
                                    <h3 className="mb-2 font-medium">
                                        Recent Transfers
                                    </h3>
                                    <div className="space-y-2">
                                        <TransferItem
                                            name="Project.zip"
                                            status="Completed"
                                        />
                                        <TransferItem
                                            name="Presentation.pdf"
                                            status="Failed"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'receive' && (
                            <div className="flex h-full flex-col items-center justify-center">
                                <div className="w-full max-w-md rounded-lg border bg-white p-6 text-center">
                                    <div className="mx-auto mb-6 flex h-32 w-32 items-center justify-center rounded-full bg-blue-100 text-blue-800">
                                        <Download size={48} />
                                    </div>
                                    <h3 className="mb-2 text-xl font-medium">
                                        Ready to Receive
                                    </h3>
                                    <p className="mb-6 text-gray-600">
                                        Enter the transfer code to start
                                        receiving files
                                    </p>
                                    <div className="mb-4 flex space-x-2">
                                        <input
                                            type="text"
                                            placeholder="Enter code"
                                            className="flex-1 rounded-md border px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                        />
                                        <button className="rounded-md bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700">
                                            Connect
                                        </button>
                                    </div>
                                    <p className="text-sm text-gray-500">
                                        Or share your device ID to receive files
                                    </p>
                                </div>
                            </div>
                        )}

                        {activeTab === 'settings' && (
                            <div className="max-w-2xl">
                                <h3 className="mb-6 text-lg font-medium">
                                    Application Settings
                                </h3>

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
                                                    className="w-full rounded-md border px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                                />
                                            </SettingItem>
                                            <SettingItem
                                                title="Auto-clear Interval"
                                                description="How long to keep files before automatic deletion"
                                            >
                                                <select className="w-full rounded-md border px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none">
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
                                                        <input
                                                            type="radio"
                                                            name="transfer-mode"
                                                            className="mr-2"
                                                            checked
                                                        />
                                                        WebRTC (Direct)
                                                    </label>
                                                    <label className="flex items-center">
                                                        <input
                                                            type="radio"
                                                            name="transfer-mode"
                                                            className="mr-2"
                                                        />
                                                        WebSocket (Relay)
                                                    </label>
                                                </div>
                                            </SettingItem>
                                        </div>
                                    </SettingSection>
                                </div>

                                <h3 className="mb-6 text-lg font-medium">
                                    Authorization
                                </h3>
                                <div className="space-y-6">
                                    <SettingSection title="Secret">
                                        <div className="space-y-4">
                                            <SettingItem
                                                title="设置密钥"
                                                description="Preferred method for sending files"
                                            >
                                                <div className="flex items-center space-x-4">
                                                    <label className="flex items-center">
                                                        <input
                                                            type="radio"
                                                            name="transfer-mode"
                                                            className="mr-2"
                                                            checked
                                                        />
                                                        WebRTC (Direct)
                                                    </label>
                                                    <label className="flex items-center">
                                                        <input
                                                            type="radio"
                                                            name="transfer-mode"
                                                            className="mr-2"
                                                        />
                                                        WebSocket (Relay)
                                                    </label>
                                                </div>
                                            </SettingItem>
                                        </div>
                                    </SettingSection>
                                </div>

                                <h3 className="mb-6 text-lg font-medium">
                                    Device
                                </h3>
                                <div className="space-y-6">
                                    <SettingSection title="Tags">
                                        <div className="space-y-4">
                                            <SettingItem
                                                title="设备标签"
                                                description="Preferred method for sending files"
                                            >
                                                <div className="flex items-center space-x-4">
                                                    <label className="flex items-center">
                                                        <input
                                                            type="radio"
                                                            name="transfer-mode"
                                                            className="mr-2"
                                                            checked
                                                        />
                                                        WebRTC (Direct)
                                                    </label>
                                                    <label className="flex items-center">
                                                        <input
                                                            type="radio"
                                                            name="transfer-mode"
                                                            className="mr-2"
                                                        />
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
const NavItem = ({
    icon,
    children,
    active,
    onClick,
}: {
    icon: ReactNode;
    children: ReactNode;
    active: boolean;
    onClick: () => void;
}) => (
    <li>
        <button
            onClick={onClick}
            className={`flex w-full items-center space-x-3 rounded-md px-3 py-2 transition-colors ${active ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/5 hover:text-white'}`}
        >
            <span className={`${active ? 'text-blue-400' : 'text-white/50'}`}>
                {icon}
            </span>
            <span>{children}</span>
        </button>
    </li>
);

const FileCard = ({
    file,
}: {
    file: {
        id: number;
        name: string;
        type: string;
        size: string;
        date: string;
    };
}) => {
    const getIcon = () => {
        switch (file.type) {
            case 'pdf':
                return <File className="text-red-500" />;
            case 'image':
                return <ImageIcon className="text-green-500" />;
            default:
                return <Clipboard className="text-blue-500" />;
        }
    };

    return (
        <div className="cursor-pointer rounded-lg border bg-white p-4 transition-shadow hover:shadow-sm">
            <div className="flex items-start space-x-3">
                <div className="rounded-md bg-gray-100 p-2">{getIcon()}</div>
                <div className="flex-1">
                    <h3 className="truncate font-medium">{file.name}</h3>
                    <div className="mt-1 flex justify-between text-sm text-gray-500">
                        <span>{file.size}</span>
                        <span>{file.date}</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

const TransferItem = ({ name, status }: { name: string; status: string }) => {
    const statusColor =
        status === 'Completed' ? 'text-green-600' : 'text-red-600';

    return (
        <div className="flex items-center justify-between rounded-lg border bg-white p-3">
            <div className="flex items-center space-x-3">
                <File size={18} className="text-gray-400" />
                <span className="truncate">{name}</span>
            </div>
            <span className={`text-sm ${statusColor}`}>{status}</span>
        </div>
    );
};

const SettingSection = ({
    title,
    children,
}: {
    title: string;
    children: ReactNode;
}) => (
    <div className="border-b pb-6">
        <h4 className="mb-4 text-lg font-medium">{title}</h4>
        {children}
    </div>
);

const SettingItem = ({
    title,
    description,
    children,
}: {
    title: string;
    description: string;
    children: ReactNode;
}) => (
    <div>
        <h5 className="mb-1 font-medium">{title}</h5>
        <p className="mb-2 text-sm text-gray-600">{description}</p>
        {children}
    </div>
);

export default EphemeraApp;
