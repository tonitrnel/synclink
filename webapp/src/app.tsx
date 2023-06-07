import { ReactComponent as LogoIcon } from './assets/logo.svg';
import { Input } from './components/input';
import { List } from '~/components/list';
import './app.css';

function App() {
  return (
    <>
      <header className="header">
        <LogoIcon className="header-icon" />
        <h1 className="header-title">SyncLink</h1>
      </header>
      <main className="main">
        <Input />
        <List />
      </main>
    </>
  );
}

export default App;
