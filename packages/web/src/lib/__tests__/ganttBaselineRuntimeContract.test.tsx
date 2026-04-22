// @vitest-environment jsdom

import React from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';

import { GanttChart } from '../../components/GanttChart.tsx';
import {
  BASELINE_CANDIDATES,
  GANTT_BASELINE_RUNTIME_CONTRACT_SUMMARY,
  LIVE_FIXTURE_TASKS,
  NON_MATCHING_BASELINE_FIXTURE_TASKS,
  applyBaselineCandidate,
  captureRuntimeProbeSignature,
  characterizeAgainstControl,
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

function renderChart(tasks: unknown): { container: HTMLDivElement; root: Root } {
  const container = document.createElement('div');
  document.body.appendChild(container);

  const root = createRoot(container);
  root.render(
    <GanttChart
      tasks={tasks as never}
      dayWidth={40}
      rowHeight={40}
      headerHeight={40}
      showChart={true}
      showTaskList={false}
      disableTaskDrag={true}
    />,
  );

  return { container, root };
}

function flushRender(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

describe('gantt baseline runtime contract', () => {
  it('documents the current characterization verdict for downstream wiring', () => {
    expect(GANTT_BASELINE_RUNTIME_CONTRACT_SUMMARY.status).toBe('unsupported-locally');
    expect(GANTT_BASELINE_RUNTIME_CONTRACT_SUMMARY.provenFieldSet).toBeNull();
    expect(GANTT_BASELINE_RUNTIME_CONTRACT_SUMMARY.rationale).toContain('exact same DOM signature');
  });

  it('renders deterministic live-task signatures for the control fixture', async () => {
    const { container, root } = renderChart(LIVE_FIXTURE_TASKS);
    await flushRender();

    const signature = captureRuntimeProbeSignature(container);

    expect(signature.taskbarCount).toBe(2);
    expect(signature.milestoneCount).toBe(1);
    expect(signature.progressBarCount).toBe(1);
    expect(signature.taskbars[0]).toMatchObject({
      className: expect.stringContaining('gantt-tr-taskBar'),
      left: '160px',
      width: '200px',
      height: 'var(--gantt-task-bar-height)',
      backgroundColor: 'rgb(79, 70, 229)',
      text: '40%',
    });
    expect(signature.taskbars[1]).toMatchObject({
      className: expect.stringContaining('gantt-tr-milestone'),
      left: expect.stringMatching(/px$/),
      width: expect.stringMatching(/px$/),
      text: '',
    });
    expect(signature.rowText[0]).toContain('Live task');
    expect(signature.rowText[1]).toContain('Live milestone');

    root.unmount();
  });

  it('shows every supported candidate baseline field set is ignored by the installed runtime', async () => {
    const controlRender = renderChart(LIVE_FIXTURE_TASKS);
    await flushRender();
    const controlSignature = captureRuntimeProbeSignature(controlRender.container);
    controlRender.root.unmount();

    const candidateSignatures: Array<{
      candidateId: (typeof BASELINE_CANDIDATES)[number]['id'];
      signature: ReturnType<typeof captureRuntimeProbeSignature>;
    }> = [];

    for (const candidate of BASELINE_CANDIDATES) {
      const probeRender = renderChart(applyBaselineCandidate(LIVE_FIXTURE_TASKS, candidate.id));
      await flushRender();
      candidateSignatures.push({
        candidateId: candidate.id,
        signature: captureRuntimeProbeSignature(probeRender.container),
      });
      probeRender.root.unmount();
    }

    const results = characterizeAgainstControl(controlSignature, candidateSignatures);

    expect(results).toHaveLength(BASELINE_CANDIDATES.length);
    expect(results.every((result) => result.matchesControl)).toBe(true);
    expect(results.map((result) => result.candidateId)).toEqual(BASELINE_CANDIDATES.map((candidate) => candidate.id));
  });

  it('keeps unmatched baseline payloads inert instead of projecting phantom overlay bars', async () => {
    const controlRender = renderChart(NON_MATCHING_BASELINE_FIXTURE_TASKS);
    await flushRender();
    const controlSignature = captureRuntimeProbeSignature(controlRender.container);
    controlRender.root.unmount();

    const probeRender = renderChart(
      applyBaselineCandidate(NON_MATCHING_BASELINE_FIXTURE_TASKS, 'baselineStartDate_endDate', {
        nonMatchingTaskId: 'task-without-baseline',
      }),
    );
    await flushRender();
    const candidateSignature = captureRuntimeProbeSignature(probeRender.container);
    probeRender.root.unmount();

    expect(candidateSignature).toEqual(controlSignature);
    expect(candidateSignature.taskbarCount).toBe(3);
    expect(candidateSignature.rowText[2]).toContain('No matching baseline payload');
  });
});
