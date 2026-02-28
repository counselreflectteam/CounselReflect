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
    label: 'Therapist',
    icon: <Stethoscope className="w-3 h-3" />,
    description: 'Evaluate therapist responses',
    styles: {
      bg: 'bg-blue-100 dark:bg-blue-900/30',
      text: 'text-blue-700 dark:text-blue-300'
    }
  },
  'patient': {
    value: 'patient',
    label: 'Patient',
    icon: <User className="w-3 h-3" />,
    description: 'Evaluate patient utterances',
    styles: {
      bg: 'bg-green-100 dark:bg-green-900/30',
      text: 'text-green-700 dark:text-green-300'
    }
  },
  'both': {
    value: 'both',
    label: 'Both',
    icon: <Users className="w-3 h-3" />,
    description: 'Evaluate all turns',
    styles: {
      bg: 'bg-gray-100 dark:bg-gray-700',
      text: 'text-gray-700 dark:text-gray-300'
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

export const TargetSpeakerBadge: React.FC<TargetSpeakerBadgeProps> = ({ 
  target, 
  className = "",
  showIcon = true 
}) => {
  const config = getTargetConfig(target);
  
  return (
    <span 
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${config.styles.bg} ${config.styles.text} ${className}`} 
      title={`Analyzes ${config.label.toLowerCase()} turns`}
    >
      {showIcon && config.icon}
      {config.label}
    </span>
  );
};
