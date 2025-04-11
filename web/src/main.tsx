import ReactDOM from 'react-dom/client';
import { StrictMode } from 'react';
import App from '~/pages/app.tsx';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
