import { FC, ReactNode, useCallback, useEffect, useMemo } from 'react';
import {
  Share2Icon,
  LayoutDashboardIcon,
  SettingsIcon,
  HardDriveIcon,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLingui } from '@lingui/react/macro';
import { ReactComponent as LogoIcon } from '~/assets/logo.svg';
import { clsx } from '~/utils/clsx.ts';
import { useStatsQuery } from '~/endpoints';
import { formatBytes } from '~/utils/format-bytes.ts';

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
  <li className="h-[39px] w-[196px] text-sm">
    <button
      onClick={onClick}
      className={clsx(
        'flex h-full w-full items-center space-x-3 rounded p-3 transition-colors',
        active
          ? 'bg-gray-200/10 text-white'
          : 'text-white/70 hover:bg-white/5 hover:text-white',
      )}
    >
      <span className={`${active ? 'text-current' : 'text-white/50'}`}>
        {icon}
      </span>
      <span className="leading-none">{children}</span>
    </button>
  </li>
);

export interface SidebarProps {
  bg_url?: string;
}

export const Sidebar: FC<SidebarProps> = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useLingui();
  const { data, error, refresh } = useStatsQuery({
    keepDirtyOnPending: true,
    cache: {
      key: 'stats',
    },
  });
  const setActiveTab = useCallback(
    (active: string) => {
      navigate(`/${active}`);
    },
    [navigate],
  );
  const activeTab = useMemo(
    () => location.pathname.replace('/', ''),
    [location.pathname],
  );
  const stats = useMemo(() => {
    if (!data) return undefined;
    return {
      storage_quota: formatBytes(data.storage_quota),
      disk_usage: `${Math.trunc((data.disk_usage / data.storage_quota) * 100) / 100}%`,
      percentage: `(${Math.floor(
        (data.disk_usage / (data.storage_quota - data.default_reserved)) * 100,
      )})%`,
      memory_usage: formatBytes(data.memory_usage),
      uptime: formatDur(data?.uptime ?? 0),
    };
  }, [data]);
  const online = useMemo(() => {
    return !error && navigator.onLine;
  }, [error]);
  useEffect(() => {
    const onvisibilitychange = () => {
      if (document.visibilityState === 'visible') {
        refresh();
      }
    };
    document.addEventListener('visibilitychange', onvisibilitychange);
    window.addEventListener('focus', onvisibilitychange);
    return () => {
      document.removeEventListener('visibilitychange', onvisibilitychange);
      window.removeEventListener('focus', onvisibilitychange);
    };
  }, []);
  return (
    <aside
      className="relative w-[342px] bg-cover bg-center p-4"
      style={{
        backgroundImage: `url(/sidebar_bg.jpg)`,
      }}
    >
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
      <div className="relative z-10 flex h-full flex-col p-4">
        <div className="mb-12">
          <LogoIcon className="h-20 w-20 rounded-md text-white" />
          <h1 className="-mt-4 text-2xl font-bold text-white">Ephemera</h1>
          <p className="text-sm text-white/80">Temporary storage & transfer</p>
        </div>

        <nav className="flex-1">
          <ul className="space-y-2 font-medium">
            <NavItem
              icon={<LayoutDashboardIcon size={18} />}
              active={activeTab === 'stash'}
              onClick={() => setActiveTab('stash')}
            >
              {t`暂存区`}
            </NavItem>
            <NavItem
              icon={<Share2Icon size={18} />}
              active={activeTab === 'transfer'}
              onClick={() => setActiveTab('transfer')}
            >
              {t`互联`}
            </NavItem>
            <NavItem
              icon={<SettingsIcon size={18} />}
              active={activeTab === 'settings'}
              onClick={() => setActiveTab('settings')}
            >
              {t`设置`}
            </NavItem>
          </ul>
        </nav>

        <div className="mt-auto flex flex-col gap-2 text-sm text-white/80">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-2.5">
              <i
                className={clsx(
                  'inline-block h-2 w-2 rounded-full',
                  online ? 'bg-green-500' : 'bg-red-500',
                )}
              />
              <span className="block leading-none">
                {online ? '在线' : '离线'}
              </span>
            </div>
            <div className="flex items-center gap-2.5">
              <HardDriveIcon className="size-4" />
              <span className="block w-24 leading-none text-white/60">
                {stats?.disk_usage || '-'}
              </span>
            </div>
          </div>
          {/*<div className="flex justify-start gap-2.5 mt-4">*/}
          {/*<div>*/}
          {/*  <HardDriveIcon className="size-4"/>*/}
          {/*  <span className="text-xs">存储占用:</span>*/}
          {/*  <span className="text-white/60 block w-24 text-xs">{stats?.disk_usage || '-'}</span>*/}
          {/*</div>*/}
          {/*<div>*/}
          {/*  <MemoryStickIcon className="size-4"/>*/}
          {/*  <span className="text-xs">内存使用:</span>*/}
          {/*  <span className="text-white/60 block w-24 text-xs">{stats?.memory_usage || '-'}</span>*/}
          {/*</div>*/}
          {/*<div>*/}
          {/*  <Clock4Icon className="size-4"/>*/}
          {/*  <span className="text-xs">运行时间:</span>*/}
          {/*  <span className="text-white/60 block w-24 text-xs">{stats?.uptime || '-'}</span>*/}
          {/*</div>*/}
          {/*</div>*/}
        </div>
      </div>
    </aside>
  );
};

const formatDur = (dur: number) => {
  if (dur === 0) return '0';
  if (dur > 86400) {
    return `${Math.floor(dur / 86400)}d`;
  }
  if (dur > 3600) {
    return `${Math.floor(dur / 3600)}h`;
  }
  if (dur > 60) {
    return `${Math.floor(dur / 60)}min`;
  }
  return `${dur}s`;
};
