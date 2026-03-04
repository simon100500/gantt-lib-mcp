import { GanttChart } from './components/GanttChart.tsx';
import { useTasks } from './hooks/useTasks.ts';

export default function App() {
  const { tasks, loading, error } = useTasks();

  if (error) {
    return (
      <div style={{ padding: 20, color: 'red' }}>
        Failed to load tasks: {error}. Is the server running on :3000?
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'sans-serif' }}>
      {/* Gantt area */}
      <main style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {loading ? (
          <div style={{ padding: 20 }}>Loading...</div>
        ) : (
          <GanttChart tasks={tasks} />
        )}
      </main>
      {/* Chat sidebar placeholder — implemented in 07-05 */}
      <aside
        id="chat-sidebar-slot"
        style={{ width: 360, borderLeft: '1px solid #e0e0e0', display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ padding: 16, color: '#888' }}>Chat sidebar coming soon...</div>
      </aside>
    </div>
  );
}
