import { auth } from '../lib/firebase.ts';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (auth.currentUser) {
    const token = await auth.currentUser.getIdToken();
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

export async function apiRequest<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    body?: unknown;
  } = {},
): Promise<T> {
  const headers = await getAuthHeaders();
  const res = await fetch(`/api/v1${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export async function broadcastRealtimeEvent(
  event:
    | 'order:created'
    | 'order:updated'
    | 'kitchen:updated'
    | 'availability:updated'
    | 'settings:updated'
    | 'table:updated'
    | 'reservation:updated'
    | 'catalog:updated',
  payload: Record<string, unknown>,
) {
  try {
    if (!auth.currentUser) return;
    await apiRequest('/events/broadcast', {
      method: 'POST',
      body: { event, payload },
    });
  } catch {
    // Non-fatal if socket broadcast fails while Firestore listener remains active
  }
}

export async function uploadMediaFile(
  file: File,
): Promise<{ url: string; kind: 'image' | 'video'; sizeBytes: number }> {
  const allowedMimes = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm',
    'video/quicktime',
  ];
  if (!allowedMimes.includes(file.type)) {
    throw new Error('Please upload JPG, PNG, WebP, GIF photos or MP4, WebM, MOV videos.');
  }
  if (file.size > 18 * 1024 * 1024) {
    throw new Error('Media file size must be 18 MB or less.');
  }

  const base64Data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read file.'));
    reader.readAsDataURL(file);
  });

  return apiRequest<{ url: string; kind: 'image' | 'video'; sizeBytes: number }>('/media/upload', {
    method: 'POST',
    body: {
      fileName: file.name,
      mimeType: file.type,
      base64Data,
    },
  });
}
