import { Route, Routes } from 'react-router-dom';
import Dashboard from './components/dashboard';
import Login from './components/login';
import Redirect from './components/Redirect';

function App() {
  return (
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/redirect" element={<Redirect />} />
        <Route path="*" element={<Login />} />
      </Routes>
  );
}

export default App;
