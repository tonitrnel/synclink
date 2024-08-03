import { useState } from 'react';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { useSnackbar } from '~/components/ui/snackbar';
import { TagInput } from '~/components/ui/tag-input';
import { useToast } from '~/components/ui/toast';

export default function DebugPage() {
  const snackbar = useSnackbar();
  const toast = useToast();
  const [tags, setTags] = useState<string[]>(['Apple', 'Banana']);
  return (
    <section className="p-10 w-full">
      <h1 className="font-bold text-xxl">Debug Page</h1>
      <div className="my-6">
        <h2 className="font-bold my-4">snackbar: </h2>
        <div className="flex gap-2">
          <Button
            onClick={() =>
              snackbar.enqueueSnackbar({
                variant: 'success',
                message: '喵喵喵',
              })
            }
          >
            success
          </Button>
          <Button
            onClick={() =>
              snackbar.enqueueSnackbar({
                variant: 'error',
                message: '喵喵喵',
              })
            }
          >
            error
          </Button>
          <Button
            onClick={() =>
              snackbar.enqueueSnackbar({
                variant: 'warning',
                message: '喵喵喵',
              })
            }
          >
            warning
          </Button>
          <Button
            onClick={() =>
              snackbar.enqueueSnackbar({
                variant: 'info',
                message: '喵喵喵',
              })
            }
          >
            info
          </Button>
          <Button
            onClick={() =>
              snackbar.enqueueSnackbar({
                message: '喵喵喵',
              })
            }
          >
            default
          </Button>
          <Button
            onClick={() =>
              snackbar.enqueueSnackbar({
                variant: 'info',
                message: '喵喵喵',
                autoHideDuration: 'persist',
              })
            }
          >
            persist
          </Button>
          <Button
            onClick={() =>
              snackbar.enqueueSnackbar({
                variant: 'info',
                title: 'Say:',
                message: '喵喵喵',
                autoHideDuration: 'persist',
              })
            }
          >
            contain title
          </Button>
        </div>
      </div>
      <div>
        <h2 className="font-bold my-4">toast: </h2>
        <div className="flex gap-2">
          <Button
            onClick={() =>
              toast.toast({
                title: 'INFO',
                duration: 5 * 60 * 1000,
                closable: false,
                className: 'bg-[#fbfcfe]',
                description: (
                  <div>
                    <p>
                      The villagers want to share some mysterious documents with
                      you
                    </p>
                    <p>Do you want to receive it?</p>
                  </div>
                ),
              })
            }
          >
            toast
          </Button>
        </div>
      </div>
      <div>
        <h2 className="font-bold my-4">Tag Input: </h2>
        <div className="flex gap-2">
          <TagInput value={tags} onChange={(value) => setTags(value)}  className='w-[20rem]' max={6} placeholder="fruits" />
          <Input value={tags.join(", ")} className='w-[20rem]' onChange={noop} />
        </div>
      </div>
    </section>
  );
}

const noop = () => void 0;
