import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UploadZone } from '@/components/upload-zone';

// ===== Mock react-dropzone =====

const { mockGetRootProps, mockGetInputProps, mockOpen } = vi.hoisted(() => ({
  mockGetRootProps: vi.fn(() => ({
    onClick: vi.fn(),
    onKeyDown: vi.fn(),
    onFocus: vi.fn(),
    onBlur: vi.fn(),
    onDragEnter: vi.fn(),
    onDragOver: vi.fn(),
    onDragLeave: vi.fn(),
    onDrop: vi.fn(),
    ref: { current: null },
    tabIndex: 0,
    role: 'button',
    'aria-label': 'CSV file upload zone',
  })),
  mockGetInputProps: vi.fn(() => ({
    accept: '.csv',
    autoComplete: 'off',
    multiple: false,
    onChange: vi.fn(),
    onClick: vi.fn(),
    ref: { current: null },
    style: { display: 'none' },
    tabIndex: -1,
    type: 'file',
  })),
  mockOpen: vi.fn(),
}));

vi.mock('react-dropzone', () => ({
  useDropzone: vi.fn(() => ({
    getRootProps: mockGetRootProps,
    getInputProps: mockGetInputProps,
    isDragActive: false,
    isDragReject: false,
    isDragAccept: false,
    open: mockOpen,
  })),
}));

// ===== UploadZone =====

describe('UploadZone', () => {
  const defaultProps = {
    onFileSelect: vi.fn(),
    isUploading: false,
    selectedFile: null,
    error: null,
    onClear: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the idle state when no file is selected', () => {
    render(<UploadZone {...defaultProps} />);

    expect(screen.getByText('Drag & drop your CSV file here')).toBeInTheDocument();
    expect(screen.getByText('browse files')).toBeInTheDocument();
    expect(screen.getByText(/CSV up to 50 MB/)).toBeInTheDocument();
  });

  it('should show feature badges in idle state', () => {
    render(<UploadZone {...defaultProps} />);

    expect(screen.getByText('✓ Any CSV format')).toBeInTheDocument();
    expect(screen.getByText('✓ Column auto-detection')).toBeInTheDocument();
    expect(screen.getByText('✓ AI mapping')).toBeInTheDocument();
  });

  it('should show selected file info when a file is selected', () => {
    const file = new File(['test content'], 'contacts.csv', { type: 'text/csv' });
    render(<UploadZone {...defaultProps} selectedFile={file} />);

    expect(screen.getByText('contacts.csv')).toBeInTheDocument();
    expect(screen.getByText('CSV')).toBeInTheDocument();
    expect(screen.getByText('File validated')).toBeInTheDocument();
  });

  it('should show remove button when file is selected and not uploading', () => {
    const file = new File(['test'], 'contacts.csv', { type: 'text/csv' });
    render(<UploadZone {...defaultProps} selectedFile={file} />);

    const removeButton = screen.getByRole('button', { name: /remove file/i });
    expect(removeButton).toBeInTheDocument();
  });

  it('should hide remove button when uploading', () => {
    const file = new File(['test'], 'contacts.csv', { type: 'text/csv' });
    render(<UploadZone {...defaultProps} selectedFile={file} isUploading={true} />);

    expect(screen.queryByRole('button', { name: /remove file/i })).not.toBeInTheDocument();
  });

  it('should call onClear when remove button is clicked', () => {
    const file = new File(['test'], 'contacts.csv', { type: 'text/csv' });
    const onClear = vi.fn();
    render(<UploadZone {...defaultProps} selectedFile={file} onClear={onClear} />);

    const removeButton = screen.getByRole('button', { name: /remove file/i });
    fireEvent.click(removeButton);

    expect(onClear).toHaveBeenCalled();
  });

  it('should show uploading overlay when uploading', () => {
    render(<UploadZone {...defaultProps} isUploading={true} />);

    expect(screen.getByText('Uploading and analyzing...')).toBeInTheDocument();
    expect(screen.getByText('Parsing CSV structure')).toBeInTheDocument();
  });

  it('should show error message when error is provided', () => {
    render(<UploadZone {...defaultProps} error="File is too large" />);

    expect(screen.getByText('Upload Error')).toBeInTheDocument();
    expect(screen.getByText('File is too large')).toBeInTheDocument();
  });

  it('should have aria-describedby for error state', () => {
    render(<UploadZone {...defaultProps} error="Test error" />);

    const dropzone = screen.getByRole('button', { name: /csv file upload zone/i });
    expect(dropzone).toHaveAttribute('aria-describedby', 'upload-error');
  });

  it('should not have aria-describedby when no error', () => {
    render(<UploadZone {...defaultProps} />);

    const dropzone = screen.getByRole('button', { name: /csv file upload zone/i });
    expect(dropzone).not.toHaveAttribute('aria-describedby');
  });

  it('should show dismiss button on error message', () => {
    render(<UploadZone {...defaultProps} error="Something went wrong" />);

    const dismissButton = screen.getByRole('button', { name: /dismiss error/i });
    expect(dismissButton).toBeInTheDocument();
  });

  it('should disable the dropzone during upload', () => {
    render(<UploadZone {...defaultProps} isUploading={true} />);

    const dropzone = screen.getByRole('button', { name: /csv file upload zone/i });
    expect(dropzone).toHaveAttribute('tabIndex', '-1');
  });
});
