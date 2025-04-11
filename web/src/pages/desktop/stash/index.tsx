import { Layout } from '~/components/layout/layout.tsx';
import { useState } from 'react';
import {
  CopyIcon,
  FileTextIcon,
  FilmIcon,
  ImageIcon,
  Share2Icon,
  Trash2Icon,
} from 'lucide-react';
import { DesktopInput } from '~/components/input';

const initialItems = [
  {
    id: 1,
    timestamp: new Date('2024-03-15T09:30:00'),
    ip: '192.168.1.101',
    device: 'NAS-01',
    content: '项目初步构思.txt',
    preview: '这是一个关于...（长文本测试样例，需要截断处理）',
    type: 'text',
    size: '2.4 KB',
  },
  {
    id: 2,
    timestamp: new Date('2024-03-15T10:15:00'),
    ip: '192.168.1.105',
    device: 'Mobile-张三',
    content: 'design-sketches.jpg',
    preview: '',
    type: 'image',
    size: '1.8 MB',
  },
  // 更多模拟数据...
];
const getPreviewContent = (item: (typeof initialItems)[0]) => {
  switch (item.type) {
    case 'text':
      return (
        <div className="line-clamp-3 text-gray-600">
          {item.preview || <span className="text-gray-400">空内容</span>}
        </div>
      );
    case 'image':
      return (
        <div className="flex h-32 items-center justify-center rounded-lg bg-gray-100">
          <ImageIcon className="h-8 w-8 text-gray-400" />
        </div>
      );
    case 'video':
      return (
        <div className="flex h-32 items-center justify-center rounded-lg bg-gray-100">
          <FilmIcon className="h-8 w-8 text-gray-400" />
        </div>
      );
    default:
      return (
        <div className="flex items-center text-gray-500">
          <FileTextIcon className="mr-2 h-5 w-5" />
          {item.content}
        </div>
      );
  }
};

export default function StashPage() {
  const [items, setItems] = useState(initialItems);
  return (
    <Layout titleBarProps={{ title: '暂存区' }}>
      <div className="w-full h-full flex flex-col p-6">
        <div className="mx-auto w-full grow max-w-4xl">
          <div className="space-y-4">
            {items.map((item) => (
              <div
                key={item.id}
                className="group relative rounded-lg border bg-white p-4 transition-colors hover:border-blue-200"
              >
                {/* 头部信息 */}
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-sm">
                  <span className="text-gray-500">
                    {item.timestamp.toLocaleString()}
                  </span>
                    <span className="text-gray-400">|</span>
                    <span className="font-medium text-gray-700">{item.ip}</span>
                    {item.device && (
                      <span className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-600">
                      {item.device}
                    </span>
                    )}
                  </div>
                </div>

                {/* 内容预览 */}
                <div className="mb-3">{getPreviewContent(item)}</div>

                {/* 底部信息 */}
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center space-x-3 text-gray-500">
                    <span>{item.type}</span>
                    <span className="text-gray-300">|</span>
                    <span>{item.size}</span>
                  </div>

                  {/* 操作按钮 */}
                  <div className="flex items-center space-x-3 opacity-0 transition-opacity group-hover:opacity-100">
                    <button className="p-1 hover:text-blue-600" title="复制链接">
                      <CopyIcon className="h-5 w-5" />
                    </button>
                    <button className="p-1 hover:text-green-600" title="分享">
                      <Share2Icon className="h-5 w-5" />
                    </button>
                    <button className="p-1 hover:text-red-600" title="删除">
                      <Trash2Icon className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <DesktopInput className="mx-auto w-full max-w-4xl p-4 bg-white" />
      </div>
    </Layout>
  );
}
