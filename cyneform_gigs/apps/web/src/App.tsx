import { useEffect, useState } from 'react';
import { HealthResponseSchema, type HealthResponse } from '@cyneform/contracts';

export default function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/v1/health')
      .then((r) => r.json())
      .then((data) => setHealth(HealthResponseSchema.parse(data)))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Request failed'));
  }, []);

  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="text-2xl font-bold text-slate-900">CyneForm</h1>
      <p className="mt-4 text-sm text-slate-600">
        {error
          ? `API error: ${error}`
          : health
            ? `API ${health.status}, database ${health.database}`
            : 'Checking API…'}
      </p>
    </main>
  );
}
