import { FC, PropsWithChildren } from 'react';
import { Routes, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';

export const AnimatedRoutes: FC<PropsWithChildren> = ({ children }) => {
    const location = useLocation();
    return (
        <AnimatePresence mode="wait" initial={false}>
            <Routes location={location} key={location.key}>
                {children}
            </Routes>
        </AnimatePresence>
    );
};
