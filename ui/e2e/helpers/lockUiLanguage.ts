import type { Page } from '@playwright/test'
import { LANGUAGE_STORAGE_KEY } from '../../src/i18n/storageKey'

/** Pin the real UI language key. `i18nextLng` is ignored by detectUiLanguage. */
export async function lockUiLanguage(page: Page, language: 'en' | 'es' = 'en'): Promise<void> {
  await page.addInitScript(({ key, language: value }) => {
    window.localStorage.setItem(key, value)
    window.localStorage.setItem('hocuspocus_welcome_seen_v1', '1')
  }, { key: LANGUAGE_STORAGE_KEY, language })
}
