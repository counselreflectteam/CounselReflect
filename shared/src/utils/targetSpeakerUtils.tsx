import React from 'react';
import { TargetSpeaker } from '@shared/types';
import { Stethoscope, User, Users } from 'lucide-react';

export interface TargetSpeakerConfig {
  value: TargetSpeaker;
  label: string;
  icon: React.ReactNode;
  description: string;
  styles: {
    bg: string;
    text: string;
  };
}

export const TARGET_SPEAKER_METADATA: Record<TargetSpeaker, TargetSpeakerConfig> = {
  'therapist': {
    value: 'therapist',
    label: 'Chatbot turns',
    icon: <Stethoscope className="w-3 h-3" />,
    description: 'Analyzes chatbot utterances',
    styles: {
      bg: 'bg-brand-50 dark:bg-brand-500/10',
      text: 'text-brand-700 dark:text-brand-300'
    }
  },
  'patient': {
    value: 'patient',
    label: 'Client turns',
    icon: <User className="w-3 h-3" />,
    description: 'Analyzes client utterances',
    styles: {
      bg: 'bg-[var(--cr-muted)]',
      text: 'text-[var(--cr-ink-2)]'
    }
  },
  'both': {
    value: 'both',
    label: 'All turns',
    icon: <Users className="w-3 h-3" />,
    description: 'Analyzes chatbot and client utterances',
    styles: {
      bg: 'bg-[var(--cr-muted)]',
      text: 'text-[var(--cr-ink-2)]'
    }
  }
};

export const TARGET_OPTIONS = Object.values(TARGET_SPEAKER_METADATA);

export const getTargetConfig = (target: TargetSpeaker = 'therapist') => {
  return TARGET_SPEAKER_METADATA[target] || TARGET_SPEAKER_METADATA['therapist'];
};

export interface TargetSpeakerBadgeProps {
  target: TargetSpeaker;
  className?: string;
  showIcon?: boolean;
}

// Quiet TEXT label (design spec §3) — icon + colored text, no chip surface.
export const TargetSpeakerBadge: React.FC<TargetSpeakerBadgeProps> = ({
  target,
  className = "",
  showIcon = true
}) => {
  const config = getTargetConfig(target);

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-semibold ${config.styles.text} ${className}`}
      title={config.description}
    >
      {showIcon && config.icon}
      {config.label}
    </span>
  );
};
