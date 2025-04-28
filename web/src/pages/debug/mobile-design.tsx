import { FC, MouseEventHandler, ReactNode, useState } from 'react';
import {
    LayoutDashboardIcon,
    UploadIcon,
    DownloadIcon,
    SettingsIcon,
    FileIcon,
    ImageIcon,
    ClipboardIcon,
    MenuIcon,
} from 'lucide-react';

const MobileEphemeraApp = () => {
    const [activeTab, setActiveTab] = useState('stash');
    const [showMenu, setShowMenu] = useState(false);
    const [files] = useState([
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
        <div className="flex h-screen w-full flex-col bg-gray-50">
            {/* 顶部工具栏 */}
            <header className="flex items-center justify-between border-b bg-white p-4">
                <button onClick={() => setShowMenu(!showMenu)}>
                    <MenuIcon size={24} className="text-gray-600" />
                </button>
                <h1 className="text-xl font-bold text-gray-800">Ephemera</h1>
                <div className="w-8" />
                {/* 占位保持对称 */}
            </header>

            {/* 折叠菜单 */}
            {showMenu && (
                <div className="border-b bg-white">
                    <nav className="p-4">
                        <ul className="space-y-3">
                            <MobileNavItem
                                icon={<LayoutDashboardIcon size={20} />}
                                active={activeTab === 'stash'}
                                onClick={() => {
                                    setActiveTab('stash');
                                    setShowMenu(false);
                                }}
                            >
                                Stash Area
                            </MobileNavItem>
                            <MobileNavItem
                                icon={<UploadIcon size={20} />}
                                active={activeTab === 'upload'}
                                onClick={() => {
                                    setActiveTab('upload');
                                    setShowMenu(false);
                                }}
                            >
                                Send Files
                            </MobileNavItem>
                            <MobileNavItem
                                icon={<DownloadIcon size={20} />}
                                active={activeTab === 'receive'}
                                onClick={() => {
                                    setActiveTab('receive');
                                    setShowMenu(false);
                                }}
                            >
                                Receive Files
                            </MobileNavItem>
                            <MobileNavItem
                                icon={<SettingsIcon size={20} />}
                                active={activeTab === 'settings'}
                                onClick={() => {
                                    setActiveTab('settings');
                                    setShowMenu(false);
                                }}
                            >
                                Settings
                            </MobileNavItem>
                        </ul>
                    </nav>
                </div>
            )}

            {/* 主内容区 */}
            <main className="flex-1 overflow-auto p-4">
                {activeTab === 'stash' && (
                    <div className="space-y-4">
                        <div className="rounded-xl bg-white p-4 shadow-sm">
                            <h2 className="mb-4 text-lg font-semibold">
                                Recent Files
                            </h2>
                            <div className="space-y-3">
                                {files.map((file) => (
                                    <MobileFileCard key={file.id} file={file} />
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'upload' && (
                    <div className="flex h-full flex-col">
                        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-6 text-center">
                            <UploadIcon
                                size={40}
                                className="mb-4 text-gray-400"
                            />
                            <p className="mb-2 text-gray-600">
                                Tap to select files
                            </p>
                            <button className="rounded-full bg-blue-600 px-6 py-2 text-sm text-white">
                                Choose Files
                            </button>
                        </div>

                        <div className="mt-4 rounded-xl bg-white p-4 shadow-sm">
                            <h3 className="mb-2 font-medium">
                                Recent Transfers
                            </h3>
                            <div className="space-y-2">
                                <MobileTransferItem
                                    name="Project.zip"
                                    status="Completed"
                                />
                                <MobileTransferItem
                                    name="Presentation.pdf"
                                    status="Failed"
                                />
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'receive' && (
                    <div className="rounded-xl bg-white p-6 shadow-sm">
                        <div className="mb-6 flex items-center justify-center rounded-xl bg-blue-100 p-6 text-blue-800">
                            <DownloadIcon size={48} />
                        </div>
                        <h3 className="mb-4 text-center text-xl font-medium">
                            Ready to Receive
                        </h3>
                        <input
                            type="text"
                            placeholder="Enter transfer code"
                            className="mb-4 w-full rounded-lg border px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                        <button className="w-full rounded-lg bg-blue-600 py-3 text-sm font-medium text-white">
                            Connect
                        </button>
                        <p className="mt-4 text-center text-sm text-gray-500">
                            Share your device ID: XYZ-789
                        </p>
                    </div>
                )}

                {activeTab === 'settings' && (
                    <div className="rounded-xl bg-white p-4 shadow-sm">
                        <h2 className="mb-6 text-lg font-semibold">Settings</h2>

                        <div className="space-y-6">
                            <MobileSettingItem
                                title="Storage Location"
                                value="/var/ephemera/storage"
                            />

                            <MobileSettingItem
                                title="Auto-clear"
                                value="24 hours"
                            />

                            <div className="space-y-4">
                                <h3 className="font-medium">Transfer Mode</h3>
                                <div className="space-y-2">
                                    <MobileRadioOption
                                        label="WebRTC (Direct)"
                                        checked={true}
                                    />
                                    <MobileRadioOption
                                        label="WebSocket (Relay)"
                                        checked={false}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </main>

            {/* 底部导航栏 */}
            <nav className="border-t bg-white">
                <div className="flex justify-around p-2">
                    <MobileBottomNavItem
                        icon={<LayoutDashboardIcon size={24} />}
                        active={activeTab === 'stash'}
                        onClick={() => setActiveTab('stash')}
                    />
                    <MobileBottomNavItem
                        icon={<UploadIcon size={24} />}
                        active={activeTab === 'upload'}
                        onClick={() => setActiveTab('upload')}
                    />
                    <MobileBottomNavItem
                        icon={<DownloadIcon size={24} />}
                        active={activeTab === 'receive'}
                        onClick={() => setActiveTab('receive')}
                    />
                    <MobileBottomNavItem
                        icon={<SettingsIcon size={24} />}
                        active={activeTab === 'settings'}
                        onClick={() => setActiveTab('settings')}
                    />
                </div>
            </nav>
        </div>
    );
};

// 移动端组件
const MobileNavItem: FC<{
    icon: ReactNode;
    children: ReactNode;
    active: boolean;
    onClick: MouseEventHandler<HTMLButtonElement>;
}> = ({ icon, children, active, onClick }) => (
    <li>
        <button
            onClick={onClick}
            className={`flex w-full items-center space-x-3 rounded-lg p-3 ${
                active ? 'bg-blue-50 text-blue-600' : 'text-gray-600'
            }`}
        >
            <span className={`${active ? 'text-blue-500' : 'text-gray-400'}`}>
                {icon}
            </span>
            <span className="font-medium">{children}</span>
        </button>
    </li>
);

const MobileFileCard: FC<{
    file: {
        type: string;
        size: number | string;
        name: string;
        date: string;
    };
}> = ({ file }) => {
    const getIcon = () => {
        switch (file.type) {
            case 'pdf':
                return <FileIcon size={20} className="text-red-500" />;
            case 'image':
                return <ImageIcon size={20} className="text-green-500" />;
            default:
                return <ClipboardIcon size={20} className="text-blue-500" />;
        }
    };

    return (
        <div className="flex items-center rounded-lg bg-gray-50 p-3">
            <div className="mr-3 rounded-lg bg-white p-2 shadow-sm">
                {getIcon()}
            </div>
            <div className="flex-1">
                <h3 className="truncate font-medium">{file.name}</h3>
                <div className="text-sm text-gray-500">
                    {file.size} • {file.date}
                </div>
            </div>
        </div>
    );
};

const MobileTransferItem: FC<{
    name: string;
    status: string;
}> = ({ name, status }) => {
    const statusColor =
        status === 'Completed' ? 'text-green-600' : 'text-red-600';

    return (
        <div className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
            <div className="flex items-center">
                <FileIcon size={18} className="mr-2 text-gray-400" />
                <span className="truncate">{name}</span>
            </div>
            <span className={`text-sm ${statusColor}`}>{status}</span>
        </div>
    );
};

const MobileSettingItem: FC<{
    title: string;
    value: string;
}> = ({ title, value }) => (
    <div className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
        <div>
            <h4 className="font-medium">{title}</h4>
        </div>
        <span className="text-gray-600">{value}</span>
    </div>
);

const MobileRadioOption: FC<{
    label: string;
    checked: boolean;
}> = ({ label, checked }) => (
    <label className="flex items-center space-x-3 rounded-lg bg-gray-50 p-3">
        <input
            type="radio"
            checked={checked}
            className="h-4 w-4 border-gray-300 text-blue-600"
        />
        <span>{label}</span>
    </label>
);

const MobileBottomNavItem: FC<{
    icon: ReactNode;
    active: boolean;
    onClick: MouseEventHandler<HTMLButtonElement>;
}> = ({ icon, active, onClick }) => (
    <button
        onClick={onClick}
        className={`p-2 ${active ? 'text-blue-600' : 'text-gray-400'}`}
    >
        {icon}
    </button>
);

export default MobileEphemeraApp;
