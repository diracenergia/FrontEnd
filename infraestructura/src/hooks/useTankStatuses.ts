import { useEffect, useState } from 'react'

type Node = {
  id: string;
  type: string;
  level?: number;
  name: string;
}

type TankStatusOut = {
  tank_id: string;
  level: number;
}

export default function useTankStatuses(nodes: Node[]) {
  const [tankStatuses, setTankStatuses] = useState<TankStatusOut[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    console.log("[useTankStatuses] Inicio de la función con los nodos:", nodes);

    try {
      // Validamos si 'nodes' es un arreglo antes de proceder
      if (!Array.isArray(nodes)) {
        throw new Error("Los nodos no son un arreglo válido.");
      }

      // Filtrar los nodos de tipo 'tank' y extraer su nivel
      const filteredTanks = nodes
        .filter(node => node.type === 'tank');  // Filtramos los nodos de tipo 'tank'
      
      console.log("[useTankStatuses] Nodos de tipo 'tank' encontrados:", filteredTanks);

      const tankData = filteredTanks.map((tank) => ({
        tank_id: tank.id,
        level: tank.level || 0,  // Si no hay nivel, asignamos un valor por defecto de 0
      }));

      console.log("[useTankStatuses] Datos de los tanques procesados:", tankData);

      setTankStatuses(tankData);
      setError(null);  // Si no hay error, limpiamos el estado de error
    } catch (e: any) {
      // En caso de error, lo capturamos y lo guardamos en el estado
      console.error("[useTankStatuses] Error en el procesamiento de los estados de los tanques:", e);
      setError(`Error al procesar los estados de los tanques: ${e.message}`);
    }
  }, [nodes]); // Dependemos de los cambios en los nodos para actualizar el estado

  return { tankStatuses, error }
}
