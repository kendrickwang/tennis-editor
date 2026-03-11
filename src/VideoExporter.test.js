import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import VideoExporter from './VideoExporter';
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

// ── Per-test mock instance ────────────────────────────────────────────────
let mockInstance;

beforeEach(() => {
  jest.clearAllMocks();
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
    expect(screen.getByRole('checkbox', { name: /burn scoreboard/i })).toBeInTheDocument();
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

    await waitFor(() => expect(mockInstance.load).toHaveBeenCalledTimes(1));

    // Segment extraction calls all use -c copy
    const segCalls = mockInstance.exec.mock.calls.filter(([args]) => args.includes('-c'));
    expect(segCalls.length).toBeGreaterThan(0);
    segCalls.forEach(([args]) => {
      expect(args[args.indexOf('-c') + 1]).toBe('copy');
    });
  });

  it('with scoreboard: segment execs use libx264 and overlay filter', async () => {
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

    await waitFor(() => expect(mockInstance.load).toHaveBeenCalledTimes(1));

    const overlayCalls = mockInstance.exec.mock.calls.filter(
      ([args]) => args.includes('-filter_complex')
    );
    expect(overlayCalls.length).toBe(2); // one per point
    overlayCalls.forEach(([args]) => {
      expect(args).toContain('libx264');
      expect(args.some(a => typeof a === 'string' && a.includes('overlay'))).toBe(true);
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
