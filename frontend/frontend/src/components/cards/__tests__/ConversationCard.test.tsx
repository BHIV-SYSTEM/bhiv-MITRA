import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ConversationCard from '../ConversationCard';

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

describe('ConversationCard Empty Assistant Placeholder & Bubble Suppression', () => {
  test('empty assistant placeholder does not render a blank text bubble while thinking indicator remains visible', () => {
    const emptyPlaceholderMessage = {
      id: 'msg_assistant_placeholder',
      role: 'assistant' as const,
      content: '',
      timestamp: new Date().toISOString(),
    };

    const ThinkingIndicator = () => <div data-testid="thinking-indicator">Mitra is thinking...</div>;

    const { container } = render(
      <div>
        <ConversationCard message={emptyPlaceholderMessage} />
        <ThinkingIndicator />
      </div>
    );

    // Thinking indicator is visible in the DOM
    expect(screen.getByTestId('thinking-indicator')).toBeInTheDocument();
    expect(screen.getByText('Mitra is thinking...')).toBeInTheDocument();

    // No assistant avatar "M" or styled message bubble is rendered
    expect(screen.queryByText('M')).not.toBeInTheDocument();
    expect(container.querySelector('.rounded-tl-sm')).toBeNull();
    expect(container.querySelector('.break-words')).toBeNull();
  });

  test('whitespace-only assistant placeholder does not render a blank text bubble', () => {
    const whitespaceMessage = {
      id: 'msg_whitespace',
      role: 'assistant' as const,
      content: '   \n\t  ',
      timestamp: new Date().toISOString(),
    };

    const { container } = render(<ConversationCard message={whitespaceMessage} />);

    // Entire card should be suppressed
    expect(container.firstChild).toBeNull();
    expect(screen.queryByText('M')).not.toBeInTheDocument();
  });

  test('non-empty assistant message renders normally', () => {
    const activeAssistantMessage = {
      id: 'msg_active',
      role: 'assistant' as const,
      content: 'Hello! How can I assist you today?',
      timestamp: new Date().toISOString(),
    };

    render(<ConversationCard message={activeAssistantMessage} />);

    // Assistant avatar "M" is rendered
    expect(screen.getByText('M')).toBeInTheDocument();
    // Assistant message text is rendered
    expect(screen.getByText('Hello! How can I assist you today?')).toBeInTheDocument();
  });

  test('assistant message with no plain text but a meaningful capability card renders the card without a blank bubble', () => {
    const capabilityOnlyMessage = {
      id: 'msg_cap_only',
      role: 'assistant' as const,
      content: '',
      timestamp: new Date().toISOString(),
      capabilityResult: {
        capability: 'calendar',
        intent: 'SCHEDULE_EVENT',
        status: 'success' as const,
        summary: 'Team standup scheduled for 10:00 AM.',
        data: {
          event_title: 'Team Standup',
          time: '10:00 AM',
        },
      },
    };

    const { container } = render(<ConversationCard message={capabilityOnlyMessage} />);

    // Assistant avatar "M" is rendered
    expect(screen.getByText('M')).toBeInTheDocument();

    // Capability card summary is rendered
    expect(screen.getByText('Team standup scheduled for 10:00 AM.')).toBeInTheDocument();

    // Empty text bubble is NOT rendered
    expect(container.querySelector('.rounded-tl-sm')).toBeNull();
  });

  test('assistant message with no plain text but a meaningful approval card renders normally without a blank bubble', () => {
    const approvalOnlyMessage = {
      id: 'msg_approval_only',
      role: 'assistant' as const,
      content: '',
      timestamp: new Date().toISOString(),
      capabilityResult: {
        capability: 'email',
        intent: 'SEND_MESSAGE',
        status: 'pending' as const,
        summary: 'Confirmation required to send email.',
        data: {
          confirmation: {
            channel: 'EMAIL',
            pending_action_id: 'pca_test_456',
            recipient: 'client@example.com',
            subject: 'Project Proposal',
            content: 'Here is the proposal.',
          },
        },
      },
    };

    const { container } = render(<ConversationCard message={approvalOnlyMessage} />);

    // Assistant avatar "M" is rendered
    expect(screen.getByText('M')).toBeInTheDocument();

    // Confirmation details are rendered
    expect(screen.getByText(/client@example\.com/i)).toBeInTheDocument();

    // Empty text bubble is NOT rendered
    expect(container.querySelector('.rounded-tl-sm')).toBeNull();
  });

  test('user message renders normally', () => {
    const userMessage = {
      id: 'msg_user_1',
      role: 'user' as const,
      content: 'Can you show me my schedule?',
      timestamp: new Date().toISOString(),
    };

    render(<ConversationCard message={userMessage} />);

    // User avatar "U" is rendered
    expect(screen.getByText('U')).toBeInTheDocument();
    // User message text is rendered
    expect(screen.getByText('Can you show me my schedule?')).toBeInTheDocument();
  });
});
