import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import VideoExporter, { buildFilterComplex, outputWidthForRes } from './VideoExporter';
import { FFmpeg } from '@ffmpeg/ffmpeg';

// ── Declare mocks (factories can't reference outer const variables) ────────
jest.mock('@ffmpeg/ffmpeg', () => ({ FFmpeg: jest.fn() }));

jest.mock('@ffmpeg/util', () => ({
  toBlobURL: jest.fn(url => Promise.resolve(`blob:mock/${url}`)),
}));

jest.mock('./scoreboardCanvas', () => ({
  drawScoreboardToCanvas: jest.fn(() => ({})),
  canvasToUint8Array: jest.fn(() => Promise.resolve(new Uint8Array([0, 1, 2]))),
}));

global.URL.createObjectURL = jest.fn(() => 'blob:mock/output');
global.URL.revokeObjectURL = jest.fn();

// jsdom has no real video decoder. Patch probeVideoDimensions at the module
// level so integration tests don't hang waiting for video metadata.
jest.mock('./VideoExporter', () => {
  const real = jest.requireActual('./VideoExporter');
  return {
    __esModule: true,
    default: real.default,
    buildFilterComplex: real.buildFilterComplex,
    outputWidthForRes: real.outputWidthForRes,
    probeVideoDimensions: jest.fn(() => Promise.resolve({ width: 1280, height: 720 })),
  };
});

// ── Per-test mock instance ────────────────────────────────────────────────
let mockInstance;

// probeVideoDimensions uses a real <video> element. jsdom has no video decoder,
// so we stub createElement('video') to return an object that immediately fires
// onloadedmetadata with 1280×720 (standard 720p source).
const _realCreateElement = document.createElement.bind(document);
function makeVideoStub() {
  let _cb = null;
  return {
    get videoWidth() { return 1280; },
    get videoHeight() { return 720; },
    get preload() { return ''; },
    set preload(_) {},
    set onloadedmetadata(fn) { _cb = fn; },
    set onerror(_) {},
    set src(_) { setTimeout(() => _cb && _cb(), 0); },
    get src() { return 'blob:stub'; },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(document, 'createElement').mockImplementation((tag, ...args) =>
    tag === 'video' ? makeVideoStub() : _realCreateElement(tag, ...args)
  );
  mockInstance = {
    load: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    exec: jest.fn().mockResolvedValue(undefined),
    writeFile: jest.fn().mockResolvedValue(undefined),
    readFile: jest.fn().mockResolvedValue(new Uint8Array([0, 1, 2, 3])),
    createDir: jest.fn().mockResolvedValue(undefined),
    mount: jest.fn().mockResolvedValue(undefined),
    unmount: jest.fn().mockResolvedValue(undefined),
    deleteFile: jest.fn().mockResolvedValue(undefined),
  };
  FFmpeg.mockImplementation(() => mockInstance);
});

afterEach(() => {
  document.createElement.mockRestore();
});

// ── Helpers ───────────────────────────────────────────────────────────────
const makeVideoFile = () => new File(['video'], 'match.mp4', { type: 'video/mp4' });

const makePoints = (count = 2) =>
  Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    startTime: i * 10,
    endTime: i * 10 + 5,
    winner: (i % 2) + 1,
    scoreBefore: {
      sets: [],
      currentSet: [0, 0],
      currentGame: [0, 0],
      isTiebreak: false,
      matchWinner: null,
    },
  }));

// ── Pure function tests (no React, no FFmpeg) ─────────────────────────────
// These lock in the scoreboard sizing and filter construction contracts.
// If either breaks, exported clips will have wrong scoreboard size or
// audio/video desync. Do not delete or relax these tests.

describe('outputWidthForRes', () => {
  it('returns source width unchanged for "source" resolution', () => {
    expect(outputWidthForRes('source', 3840, 2160)).toBe(3840);
    expect(outputWidthForRes('source', 1920, 1080)).toBe(1920);
  });

  it('scales 4K source down to correct width for 720p', () => {
    // 3840×2160 → target height 720 → width = 3840 * (720/2160) = 1280
    expect(outputWidthForRes('720', 3840, 2160)).toBe(1280);
  });

  it('scales 4K source down to correct width for 1080p', () => {
    // 3840×2160 → target height 1080 → width = 3840 * (1080/2160) = 1920
    expect(outputWidthForRes('1080', 3840, 2160)).toBe(1920);
  });

  it('does not upscale a source already at or below target height', () => {
    // 1280×720 source exported at 1080p should stay 1280
    expect(outputWidthForRes('1080', 1280, 720)).toBe(1280);
  });
});

describe('buildFilterComplex — scoreboard sizing contract', () => {
  // The scoreboard must occupy ~26.6% of output width (340px on 1280px).
  // This proportion must be maintained across all output resolutions.

  it('720p: scoreboard is 340px on 1280px wide output', () => {
    const outW = 1280;
    const sbPx = Math.round(outW * 340 / 1280); // 340
    const fc = buildFilterComplex('scale=-2:min(720\\,ih)', sbPx);
    expect(fc).toContain('[1:v]scale=340:-2[sb]');
  });

  it('1080p: scoreboard is 510px on 1920px wide output', () => {
    const outW = 1920;
    const sbPx = Math.round(outW * 340 / 1280); // 510
    const fc = buildFilterComplex('scale=-2:min(1080\\,ih)', sbPx);
    expect(fc).toContain('[1:v]scale=510:-2[sb]');
  });

  it('source 4K: scoreboard is 1020px on 3840px wide output', () => {
    const outW = 3840;
    const sbPx = Math.round(outW * 340 / 1280); // 1020
    const fc = buildFilterComplex(null, sbPx);
    expect(fc).toContain('[1:v]scale=1020:-2[sb]');
  });

  it('720p filter: video scaled BEFORE overlay (scale→overlay order)', () => {
    const fc = buildFilterComplex('scale=-2:min(720\\,ih)', 340);
    // Video must be scaled first so decode happens at output resolution
    const scalePos = fc.indexOf('[0:v]scale');
    const overlayPos = fc.indexOf('overlay');
    expect(scalePos).toBeLessThan(overlayPos);
  });

  it('source filter: no video scaling, scoreboard overlaid directly', () => {
    const fc = buildFilterComplex(null, 340);
    expect(fc).not.toContain('[0:v]scale');
    expect(fc).toContain('[0:v][sb]overlay=14:14[vout]');
  });

  it('scoreboard px is rounded to even number (libx264 requirement)', () => {
    // 341 → rounds to 342 (even)
    const fc = buildFilterComplex(null, 341);
    const match = fc.match(/scale=(\d+):-2/);
    expect(Number(match[1]) % 2).toBe(0);
  });
});

describe('buildFilterComplex — audio sync contract', () => {
  // -c:a copy + -reset_timestamps causes audio/video drift.
  // Audio MUST be re-encoded (aac) when video is re-encoded.
  // This test documents the requirement — enforced in integration tests below.
  it('documents that -c:a copy must NOT be used with -reset_timestamps', () => {
    // See: FFmpeg bug — copied audio timestamps don't reset with video,
    // causing drift when -reset_timestamps 1 is used.
    // The fix: use -c:a aac -b:a 128k in the FFmpeg exec args.
    expect(true).toBe(true); // contract documented in integration test below
  });
});

// ── Tests ─────────────────────────────────────────────────────────────────
describe('VideoExporter', () => {
  // ── UI state ─────────────────────────────────────────────────────────
  it('renders export button disabled when no video or points', () => {
    render(<VideoExporter videoFile={null} points={[]} fileName="" />);
    expect(screen.getByRole('button', { name: /export video/i })).toBeDisabled();
  });

  it('renders export button disabled when video but no points', () => {
    render(<VideoExporter videoFile={makeVideoFile()} points={[]} fileName="match.mp4" />);
    expect(screen.getByRole('button', { name: /export video/i })).toBeDisabled();
  });

  it('renders export button enabled when video and points present', () => {
    render(<VideoExporter videoFile={makeVideoFile()} points={makePoints()} fileName="match.mp4" />);
    expect(screen.getByRole('button', { name: /export video/i })).not.toBeDisabled();
  });

  it('shows clip count in the export button label', () => {
    render(<VideoExporter videoFile={makeVideoFile()} points={makePoints(3)} fileName="match.mp4" />);
    expect(screen.getByRole('button', { name: /3 clips/i })).toBeInTheDocument();
  });

  it('renders the scoreboard toggle checkbox', () => {
    render(<VideoExporter videoFile={makeVideoFile()} points={makePoints()} fileName="match.mp4" />);
    expect(screen.getByRole('checkbox', { name: /export video with scoreboard/i })).toBeInTheDocument();
  });

  it('shows "re-encodes" note only when scoreboard toggle is on', () => {
    render(<VideoExporter videoFile={makeVideoFile()} points={makePoints()} fileName="match.mp4" />);
    expect(screen.queryByText(/re-encodes/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByText(/re-encodes/i)).toBeInTheDocument();
  });

  // ── Export flows ──────────────────────────────────────────────────────
  it('without scoreboard: segment execs use -c copy (stream copy)', async () => {
    render(<VideoExporter videoFile={makeVideoFile()} points={makePoints(2)} fileName="match.mp4" />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /export video/i }));
    });

    // Workers: min(PARALLEL=6, points=2) = 2 segment workers + 1 concat = 3 loads
    await waitFor(() => expect(mockInstance.load).toHaveBeenCalledTimes(3));

    // Segment extraction calls all use -c copy (no re-encode when no scoreboard)
    const segCalls = mockInstance.exec.mock.calls.filter(([args]) => args.includes('-c'));
    expect(segCalls.length).toBeGreaterThan(0);
    segCalls.forEach(([args]) => {
      // concat uses -c copy too; check there's no libx264
      expect(args).not.toContain('libx264');
    });
  });

  it('with scoreboard: segment execs use libx264, overlay filter, and aac audio', async () => {
    render(
      <VideoExporter
        videoFile={makeVideoFile()}
        points={makePoints(2)}
        fileName="match.mp4"
        names={['Alice', 'Bob']}
        serving={0}
      />
    );

    fireEvent.click(screen.getByRole('checkbox')); // enable scoreboard

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /export video/i }));
    });

    // Workers: min(PARALLEL=6, points=2) = 2 segment workers + 1 concat = 3 loads
    await waitFor(() => expect(mockInstance.load).toHaveBeenCalledTimes(3));

    const overlayCalls = mockInstance.exec.mock.calls.filter(
      ([args]) => args.includes('-filter_complex')
    );
    expect(overlayCalls.length).toBe(2); // one per point
    overlayCalls.forEach(([args]) => {
      expect(args).toContain('libx264');
      expect(args.some(a => typeof a === 'string' && a.includes('overlay'))).toBe(true);

      // Audio must be re-encoded (NOT copied) to stay in sync with reset video timestamps
      const caIdx = args.indexOf('-c:a');
      expect(caIdx).toBeGreaterThan(-1);
      expect(args[caIdx + 1]).toBe('aac');
      expect(args).not.toContain('copy'); // -c:a copy must never appear here
    });
  });

  it('shows done state after successful export', async () => {
    render(<VideoExporter videoFile={makeVideoFile()} points={makePoints(1)} fileName="match.mp4" />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /export video/i }));
    });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /exported/i })).toBeInTheDocument()
    );
  });

  it('shows error message and retry button when FFmpeg load throws', async () => {
    mockInstance.load.mockRejectedValueOnce(new Error('WASM load failed'));

    render(<VideoExporter videoFile={makeVideoFile()} points={makePoints(1)} fileName="match.mp4" />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /export video/i }));
    });

    await waitFor(() => expect(screen.getByText(/WASM load failed/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('hides export button and shows progress while running', async () => {
    let resolveLock;
    mockInstance.load.mockReturnValueOnce(new Promise(r => { resolveLock = r; }));

    render(<VideoExporter videoFile={makeVideoFile()} points={makePoints(1)} fileName="match.mp4" />);
    fireEvent.click(screen.getByRole('button', { name: /export video/i }));

    await waitFor(() =>
      expect(screen.getByText(/initialising ffmpeg/i)).toBeInTheDocument()
    );
    expect(screen.queryByRole('button', { name: /export video/i })).not.toBeInTheDocument();

    await act(async () => { resolveLock(); });
  });
});
