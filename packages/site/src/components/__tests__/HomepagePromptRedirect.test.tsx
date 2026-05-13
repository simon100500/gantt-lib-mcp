// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HomepagePromptRedirect } from '../HomepagePromptRedirect.tsx';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('HomepagePromptRedirect', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('creates a public project intent and redirects to the web app with the intent id', async () => {
    const assignSpy = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ intentId: 'intent-123' }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    })));
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...window.location,
        assign: assignSpy,
      },
    });

    act(() => {
      root.render(
        <HomepagePromptRedirect
          apiBaseUrl="http://localhost:3000"
          selectedPrompt="Нужен график ремонта офиса 250 м2 в 2 этапа"
        />,
      );
    });

    const submit = container.querySelector('button');

    expect(submit).not.toBeNull();

    await act(async () => {
      submit?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(fetch).toHaveBeenCalledWith('http://localhost:3000/api/public/project-intents', expect.objectContaining({
      method: 'POST',
    }));
    expect(assignSpy).toHaveBeenCalledWith('http://localhost:5173/app/new?intent=intent-123');
  });

  it('shows a validation error instead of creating an intent when the prompt is too short', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    act(() => {
      root.render(<HomepagePromptRedirect apiBaseUrl="http://localhost:3000" selectedPrompt="Коротко" />);
    });
    const submit = container.querySelector('button');

    await act(async () => {
      submit?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Опишите проект, чтобы мы могли подготовить стартовый план.');
  });
});
