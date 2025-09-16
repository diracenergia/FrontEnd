import { Routes, Route, Link } from 'react-router-dom'
import InfraestructuraPage from './components/scada/pages/InfraestructuraPage'

export default function App() {
  return (
    <div>
      <nav>
        <Link to="/infraestructura">Infraestructura</Link>
      </nav>
      <Routes>
        <Route path="/infraestructura" element={<InfraestructuraPage />} />
        {/* tus otras rutas */}
      </Routes>
    </div>
  )
}
