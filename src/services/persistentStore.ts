import { load } from '@tauri-apps/plugin-store';

type SettingsStore = Awaited<ReturnType<typeof load>>;

let settingsStorePromise: Promise<SettingsStore> | null = null;

async function getSettingsStore(): Promise<SettingsStore> {
  if (!settingsStorePromise) {
    settingsStorePromise = load('.settings.dat').catch((error) => {
      settingsStorePromise = null;
      throw error;
    });
  }
  return settingsStorePromise;
}

function normalizeStoredString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const text = value.trim();
  return text ? text : null;
}

export async function readPersistentString(key: string): Promise<string | null> {
  const store = await getSettingsStore();
  return normalizeStoredString(await store.get<unknown>(key));
}

export async function writePersistentString(key: string, value: string): Promise<void> {
  const store = await getSettingsStore();
  await store.set(key, value);
  await store.save();
}

export async function writePersistentStrings(values: Record<string, string>): Promise<void> {
  const store = await getSettingsStore();
  await Promise.all(
    Object.entries(values).map(([key, value]) => store.set(key, value))
  );
  await store.save();
}

export async function removePersistentStrings(keys: string[]): Promise<void> {
  const store = await getSettingsStore();
  await Promise.all(keys.map(key => store.delete(key)));
  await store.save();
}
