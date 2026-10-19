import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ActionCard from '../ActionCard';

// Mock framer-motion to render elements simply
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, className, ...props }: any) => (
      <div className={className} {...props}>
        {children}
      </div>
    ),
  },
}));

describe('ActionCard Presentation Filtering', () => {
  test('renders user-facing fields and hides internal plumbing metadata', () => {
    const testData = {
      // User-facing fields
      recipient: 'colleague@example.com',
      subject: 'Quarterly Review',
      event_title: 'Team Sync',
      // Internal plumbing fields that must be hidden
      trace_id: 'trace_secret_xyz123',
      idempotency_key: 'idem_key_private_999',
      governance_flags: { pii_detected: false, safe: true },
      decision: 'forward',
      severity: 0,
      delivery_state: 'internal_queued',
      status_code: 200,
      latency_ms: 45.2,
      source: 'internal_engine',
    };

    render(
      <ActionCard
        capability="email"
        intent="send"
        status="success"
        summary="Email prepared for sending."
        data={testData}
      />
    );

    // Verify summary is present
    expect(screen.getByText('Email prepared for sending.')).toBeInTheDocument();

    // Verify user-facing fields are rendered
    expect(screen.getByText('colleague@example.com')).toBeInTheDocument();
    expect(screen.getByText('Quarterly Review')).toBeInTheDocument();

    // Verify internal plumbing fields are NOT rendered in the DOM
    expect(screen.queryByText(/trace_secret_xyz123/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/idem_key_private_999/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/pii_detected/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/internal_queued/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/internal_engine/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/45\.2/i)).not.toBeInTheDocument();
  });

  test('does not render snippet block if data only contains internal fields', () => {
    const internalOnlyData = {
      trace_id: 'tr_111',
      idempotency_key: 'ik_222',
      governance_flags: {},
      status: 'success',
    };

    const { container } = render(
      <ActionCard
        capability="task"
        intent="create"
        status="success"
        summary="Task created successfully."
        data={internalOnlyData}
      />
    );

    // Summary is displayed
    expect(screen.getByText('Task created successfully.')).toBeInTheDocument();

    // Snippet container should not be rendered
    expect(container.querySelector('.bg-surface-raised')).toBeNull();
  });
});
