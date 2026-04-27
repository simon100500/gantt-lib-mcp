// @vitest-environment jsdom

import React from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { GanttChart } from '../../components/GanttChart.tsx';
import {
  GANTT_BASELINE_RUNTIME_CONTRACT_SUMMARY,
  LIVE_FIXTURE_TASKS,
  NON_MATCHING_BASELINE_FIXTURE_TASKS,
  applyBaselineCandidate,
  captureRuntimeProbeSignature,
} from '../ganttBaselineRuntimeContract.ts';

function installDomPolyfills(): void {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }

  Object.defineProperty(window, 'ResizeObserver', {
    configurable: true,
    writable: true,
    value: ResizeObserverStub,
  });

  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    writable: true,
    value: ResizeObserverStub,
  });

  Object.defineProperty(window, 'requestAnimationFrame', {
    configurable: true,
    writable: true,
    value: (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 0),
  });

  Object.defineProperty(window, 'cancelAnimationFrame', {
    configurable: true,
    writable: true,
    value: (handle: number) => window.clearTimeout(handle),
  });

  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    configurable: true,
    writable: true,
    value: function scrollTo(): void {},
  });

  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    writable: true,
    value: function scrollIntoView(): void {},
  });

  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    writable: true,
    value: function getBoundingClientRect(): DOMRect {
      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 120,
        bottom: 24,
        width: 120,
        height: 24,
        toJSON: () => ({}),
      } as DOMRect;
    },
  });
}

beforeAll(() => {
  installDomPolyfills();
});

afterEach(() => {
  document.body.innerHTML = '';
});

function renderChart(tasks: unknown, options?: { showBaseline?: boolean }): { container: HTMLDivElement; root: Root } {
  const container = document.createElement('div');
  document.body.appendChild(container);

  const root = createRoot(container);
  act(() => {
    root.render(
      <GanttChart
        tasks={tasks as never}
        dayWidth={40}
        rowHeight={40}
        headerHeight={40}
        showChart={true}
        showTaskList={false}
        showBaseline={options?.showBaseline}
        disableTaskDrag={true}
      />,
    );
  });

  return { container, root };
}

function flushRender(): Promise<void> {
  return act(async () => {
    await new Promise((resolve) => {
      window.setTimeout(resolve, 0);
    });
  });
}

describe('gantt baseline runtime contract', () => {
  it('documents the current characterization verdict for downstream wiring', () => {
    expect(GANTT_BASELINE_RUNTIME_CONTRACT_SUMMARY.status).toBe('supported-locally');
    expect(GANTT_BASELINE_RUNTIME_CONTRACT_SUMMARY.provenFieldSet).toBe('baselineStartDate_endDate + showBaseline');
    expect(GANTT_BASELINE_RUNTIME_CONTRACT_SUMMARY.rationale).toContain('showBaseline');
  });

  it('renders deterministic live-task signatures for the control fixture without baseline bars by default', async () => {
    const { container, root } = renderChart(LIVE_FIXTURE_TASKS);
    await flushRender();

    const signature = captureRuntimeProbeSignature(container);

    expect(signature.taskbarCount).toBe(2);
    expect(signature.milestoneCount).toBe(1);
    expect(signature.progressBarCount).toBe(1);
    expect(signature.baselineCount).toBe(0);
    expect(signature.taskbars[0]).toMatchObject({
      className: expect.stringContaining('gantt-tr-taskBar'),
      left: '360px',
      width: '200px',
      height: 'var(--gantt-task-bar-height)',
      backgroundColor: 'rgb(79, 70, 229)',
      text: expect.stringContaining('40%'),
    });
    expect(signature.taskbars[1]).toMatchObject({
      className: expect.stringContaining('gantt-tr-milestone'),
      left: expect.stringMatching(/px$/),
      width: expect.stringMatching(/px$/),
      text: '',
    });

    root.unmount();
  });

  it('renders baseline bars when the official baseline fields are present and showBaseline is enabled', async () => {
    const { container, root } = renderChart(
      applyBaselineCandidate(LIVE_FIXTURE_TASKS, 'baselineStartDate_endDate'),
      { showBaseline: true },
    );
    await flushRender();

    const signature = captureRuntimeProbeSignature(container);

    expect(signature.taskbarCount).toBe(2);
    expect(signature.baselineCount).toBe(2);
    expect(signature.baselineBars[0]).toMatchObject({
      className: expect.stringContaining('gantt-tr-baseline'),
      left: '120px',
      width: '200px',
      text: '',
    });
    expect(signature.baselineBars[1]).toMatchObject({
      className: expect.stringContaining('gantt-tr-baseline-milestone'),
      left: expect.stringMatching(/px$/),
      width: expect.stringMatching(/px$/),
      text: '',
    });

    root.unmount();
  });

  it('keeps baseline payloads inert when showBaseline is disabled', async () => {
    const { container, root } = renderChart(
      applyBaselineCandidate(LIVE_FIXTURE_TASKS, 'baselineStartDate_endDate'),
      { showBaseline: false },
    );
    await flushRender();

    const signature = captureRuntimeProbeSignature(container);

    expect(signature.baselineCount).toBe(0);
    expect(signature.taskbarCount).toBe(2);

    root.unmount();
  });

  it('renders baseline bars only for tasks that carry baseline dates', async () => {
    const { container, root } = renderChart(
      applyBaselineCandidate(NON_MATCHING_BASELINE_FIXTURE_TASKS, 'baselineStartDate_endDate', {
        nonMatchingTaskId: 'task-without-baseline',
      }),
      { showBaseline: true },
    );
    await flushRender();

    const signature = captureRuntimeProbeSignature(container);

    expect(signature.taskbarCount).toBe(3);
    expect(signature.baselineCount).toBe(2);
    expect(signature.rowText[2]).toContain('No matching baseline payload');

    root.unmount();
  });
});
