import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimationPage } from '~/components/animation-page';
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
        <AnimationPage className="w-full p-10">
            <h1 className="text-xxl font-bold">Debug Page</h1>
            <div className="my-6">
                <h2 className="my-4 font-bold">snackbar: </h2>
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
                </div>
                <div className="mt-2 flex gap-2">
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
                <h2 className="my-4 font-bold">toast: </h2>
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
                                            The villagers want to share some
                                            mysterious documents with you
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
                <h2 className="my-4 font-bold">Tag Input: </h2>
                <div>
                    <TagInput
                        value={tags}
                        onChange={(value) => setTags(value)}
                        className="w-[20rem]"
                        max={6}
                        placeholder="fruits"
                    />
                </div>
                <div className="mt-2">
                    <Input
                        value={tags.join(', ')}
                        className="w-[20rem]"
                        onChange={noop}
                    />
                </div>
            </div>

            <div>
                <h2 className="my-4 font-bold">Links: </h2>
                <div className="flex flex-col gap-2">
                    <Link to="/file-transfer">Navigate</Link>
                    <Link to="/debug/desktop-design">New Desktop Design</Link>
                    <Link to="/debug/mobile-design">New Mobile Design</Link>
                    <Link to="/desktop-legacy">Desktop Design Legacy</Link>
                </div>
            </div>
        </AnimationPage>
    );
}

const noop = () => void 0;
