import { useState } from 'react';
import { Copy, Share2, Trash2, ImageIcon, FileText, Film } from 'lucide-react';

// 模拟数据
const initialItems = [
  {
    id: 1,
    timestamp: new Date('2024-03-15T09:30:00'),
    ip: '192.168.1.101',
    device: 'NAS-01',
    content: '项目初步构思.txt',
    preview: '这是一个关于...（长文本测试样例，需要截断处理）',
    type: 'text',
    size: '2.4 KB'
  },
  {
    id: 2,
    timestamp: new Date('2024-03-15T10:15:00'),
    ip: '192.168.1.105',
    device: 'Mobile-张三',
    content: 'design-sketches.jpg',
    preview: '',
    type: 'image',
    size: '1.8 MB'
  },
  // 更多模拟数据...
];

export default function TempStorageApp() {
  const [items, setItems] = useState(initialItems);

  const handleDelete = (id: number) => {
    setItems(items.filter(item => item.id !== id));
  };

  const getPreviewContent = (item: typeof initialItems[0]) => {
    switch (item.type) {
      case 'text':
        return (
          <div className="text-gray-600 line-clamp-3">
            {item.preview || <span className="text-gray-400">空内容</span>}
          </div>
        );
      case 'image':
        return (
          <div className="h-32 bg-gray-100 rounded-lg flex items-center justify-center">
            <ImageIcon className="w-8 h-8 text-gray-400" />
          </div>
        );
      case 'video':
        return (
          <div className="h-32 bg-gray-100 rounded-lg flex items-center justify-center">
            <Film className="w-8 h-8 text-gray-400" />
          </div>
        );
      default:
        return (
          <div className="flex items-center text-gray-500">
            <FileText className="w-5 h-5 mr-2" />
            {item.content}
          </div>
        );
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white min-h-screen">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">临时存储中心</h1>

      <div className="space-y-4">
        {items.map(item => (
          <div
            key={item.id}
            className="group relative p-4 border rounded-lg hover:border-blue-200 transition-colors"
          >
            {/* 头部信息 */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2 text-sm">
                <span className="text-gray-500">
                  {item.timestamp.toLocaleString()}
                </span>
                <span className="text-gray-400">|</span>
                <span className="font-medium text-gray-700">{item.ip}</span>
                {item.device && (
                  <span className="px-2 py-1 bg-gray-100 rounded text-gray-600 text-xs">
                    {item.device}
                  </span>
                )}
              </div>
            </div>

            {/* 内容预览 */}
            <div className="mb-3">
              {getPreviewContent(item)}
            </div>

            {/* 底部信息 */}
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center space-x-3 text-gray-500">
                <span>{item.type}</span>
                <span className="text-gray-300">|</span>
                <span>{item.size}</span>
              </div>

              {/* 操作按钮 */}
              <div className="flex items-center space-x-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  className="p-1 hover:text-blue-600"
                  title="复制链接"
                >
                  <Copy className="w-5 h-5" />
                </button>
                <button
                  className="p-1 hover:text-green-600"
                  title="分享"
                >
                  <Share2 className="w-5 h-5" />
                </button>
                <button
                  className="p-1 hover:text-red-600"
                  title="删除"
                  onClick={() => handleDelete(item.id)}
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}