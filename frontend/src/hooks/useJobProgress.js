import { useEffect, useState } from 'react';

const POLL_MS = 1500;

/**
 * Follows an ingestion job. Primary channel: Server-Sent Events (live stages per file).
 * Fallback: if the stream errors (proxy buffering, network), poll GET /api/jobs/:id until the job ends.
 * Returns the job snapshot: { status, files:[{name,status,stage,result}], error }.
 */
export function useJobProgress(jobId, onDone) {
  const [job, setJob] = useState(null);

  useEffect(() => {
    if (!jobId) return undefined;
    let closed = false;
    let es;
    let timer;

    const fetchSnapshot = async () => {
      const res = await fetch(`/api/jobs/${jobId}`);
      if (!res.ok) throw new Error('job not found');
      return res.json();
    };
    const finish = (snap) => {
      if (closed) return;
      setJob(snap);
      if (snap.status !== 'running') {
        closed = true;
        onDone?.(snap);
      }
    };
    const poll = async () => {
      try {
        finish(await fetchSnapshot());
      } catch {
        return;
      }
      if (!closed) timer = setTimeout(poll, POLL_MS);
    };

    setJob({ status: 'running', files: [] });
    if (typeof EventSource === 'undefined') poll();
    else {
      es = new EventSource(`/api/jobs/${jobId}/events`);
      es.onmessage = async (msg) => {
        const e = JSON.parse(msg.data);
        // apply event locally for instant feedback...
        setJob((j) => j && {
          ...j,
          files: j.files.map((f) => (f.name === e.file ? e.type === 'stage' ? { ...f, status: 'running', stage: e.stage } : e.type === 'file_done' ? { ...f, status: e.result.status, stage: null, result: e.result } : e.type === 'file_start' ? { ...f, status: 'running' } : f : f)),
        });
        // ...and take the authoritative snapshot at the end
        if (e.type === 'job_done') {
          es.close();
          finish(await fetchSnapshot());
        }
      };
      es.onerror = () => {
        es.close();
        if (!closed) poll(); // degrade to polling
      };
      // seed the file list immediately
      fetchSnapshot().then((s) => !closed && setJob(s)).catch(() => {});
    }

    return () => {
      closed = true;
      es?.close();
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  return job;
}
