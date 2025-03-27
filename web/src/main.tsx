import ReactDOM from 'react-dom/client';
import { StrictMode } from 'react';
import App from '~/pages/app.tsx';

ReactDOM.createRoot(document.getElementById('main') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
