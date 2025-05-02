import ReactDOM from 'react-dom/client';
import { StrictMode } from 'react';
import App from '~/pages/app.tsx';

if (import.meta.env.DEV) {
    console.log("Press F8 when the console is open to trigger 'debugger'")
    window.addEventListener('keydown', evt => {
        if (evt.key === 'F8') {
            // eslint-disable-next-line no-debugger
            debugger
        }
    }, false)
}

ReactDOM.createRoot(document.getElementById('main') as HTMLElement).render(
    <StrictMode>
        <App />
    </StrictMode>,
);
