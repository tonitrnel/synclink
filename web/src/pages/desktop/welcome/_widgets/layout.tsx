import { FC, ReactNode } from 'react';

export const Layout: FC<{ children: ReactNode }> = ({ children }) => {
    return (
        <section className="h-full bg-gray-100 contain-layout">
            <div className="m-auto mt-[50vh] flex w-fit translate-y-[-50%] gap-4 rounded-xl bg-white p-6">
                <div className="mb-2 h-[30rem] w-[24rem] px-4">
                    <h2 className="mt-14 text-center text-2xl font-bold">
                        Welcome to Ephemera
                    </h2>
                    {children}
                </div>
                <div className="pointer-events-none w-[460px]">
                    <figure className="w-fit">
                        <picture>
                            <source
                                src="seagull-8996395_640.avif"
                                type="image/avif"
                            />
                            <img
                                src="/seagull-8996395_640.jpg"
                                alt="Colourful cartoon illustration of a hungry seagull wanting to eat out of a bag of fries that has been left on the ground."
                            />
                        </picture>
                        <figcaption className="text-right text-xs text-gray-400">
                            Image by{' '}
                            <a href="https://pixabay.com/users/richardsdrawings-858383/?utm_source=link-attribution&utm_medium=referral&utm_campaign=image&utm_content=8996395">
                                Richard Duijnstee
                            </a>{' '}
                            from{' '}
                            <a href="https://pixabay.com//?utm_source=link-attribution&utm_medium=referral&utm_campaign=image&utm_content=8996395">
                                Pixabay
                            </a>
                        </figcaption>
                    </figure>
                </div>
            </div>
        </section>
    );
};
