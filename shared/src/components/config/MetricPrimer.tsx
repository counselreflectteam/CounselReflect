import type { PredefinedMetric } from '../../types';
import { MetricMiniComic } from './MetricDoodles';

interface PrimerCopy {
  summary: string;
  caution?: {
    lead: string;
    emphasis: string;
    tail?: string;
  };
  runtime?: string;
}

const PRIMER_COPY: Record<string, PrimerCopy> = {
  emotion: {
    summary: 'Identifies which of seven emotion categories the model considers most likely for each conversational turn.',
    caution: {
      lead: 'Confidence reflects class certainty, ',
      emphasis: 'not emotional intensity',
      tail: ' or a clinical assessment.'
    }
  },
  empathy_er: {
    summary: "Classifies a chatbot response as Low, Medium, or High on the model's Emotional Reaction empathy dimension.",
    caution: {
      lead: 'These are model classes, ',
      emphasis: 'not ratings of chatbot quality',
      tail: '.'
    }
  },
  empathy_ip: {
    summary: "Classifies a chatbot response as Low, Medium, or High on the model's Interpretation empathy dimension.",
    caution: {
      lead: 'These are model classes, ',
      emphasis: 'not ratings of chatbot quality',
      tail: '.'
    }
  },
  empathy_ex: {
    summary: "Classifies a chatbot response as Low, Medium, or High on the model's Exploration empathy dimension.",
    caution: {
      lead: 'These are model classes, ',
      emphasis: 'not ratings of chatbot quality',
      tail: '.'
    }
  },
  talk_type: {
    summary: 'Classifies client language as change talk, sustain talk, or neutral talk within a motivational interviewing framework.',
    caution: {
      lead: 'The categories describe speech direction; they are ',
      emphasis: 'not progress ratings',
      tail: ' or judgments of good and bad.'
    }
  },
  emotional_support_strategy: {
    summary: 'Identifies which of eight emotional-support strategy categories the model assigns to a conversational turn.',
    caution: {
      lead: 'The endpoint score is ',
      emphasis: 'not a calibrated probability',
      tail: ' or a rating of intervention quality.'
    }
  },
  toxicity: {
    summary: 'Produces separate model scores for seven forms of potentially toxic language, including threats, insults, and identity attacks.',
    caution: {
      lead: 'The scores are independent; any threshold flag is a CounselReflect rule, ',
      emphasis: 'not a judgment of intent or safety',
      tail: '.'
    }
  },
  perspective: {
    summary: 'Estimates the probability that readers may perceive a turn as toxic, threatening, insulting, profane, or identity-attacking.',
    caution: {
      lead: 'It reflects perceived language attributes, ',
      emphasis: "not the speaker's intent",
      tail: ' or a clinical judgment.'
    }
  },
  pair: {
    summary: 'Produces a continuous model score for the quality of a chatbot reflection given the preceding client prompt.',
    caution: {
      lead: 'The score applies to the response pair, ',
      emphasis: "not the chatbot's overall performance",
      tail: '.'
    }
  },
  reccon: {
    summary: 'Extracts words or phrases in the conversation that may have triggered the assigned emotion.',
    caution: {
      lead: 'The emotion may come from another classifier, and a returned span ',
      emphasis: 'does not establish causality',
      tail: '.'
    }
  },
  fact_score: {
    summary: 'Scores how well atomic factual claims in a chatbot turn are supported by retrieved reference passages.',
    caution: {
      lead: 'Unsupported means unverified by this pipeline, ',
      emphasis: 'not necessarily false',
      tail: '; short responses can also receive a length penalty.'
    }
  },
  medscore: {
    summary: 'Measures the proportion of extracted medical claims in a chatbot turn supported by the configured textbook corpus.',
    caution: {
      lead: 'It evaluates claims against a specific retrieval corpus and ',
      emphasis: 'does not replace clinical review',
      tail: '.'
    },
    runtime: 'Claim extraction, corpus retrieval, and per-claim verification run for every chatbot turn, so this evaluation usually takes noticeably longer than other metrics.'
  }
};

export const MetricPrimer = ({
  metric
}: {
  metric: Pick<PredefinedMetric, 'name' | 'description'>;
}) => {
  const copy = PRIMER_COPY[metric.name] || { summary: metric.description };

  return (
    <section className="grid items-center gap-4 border-b border-[var(--cr-card-border)] pb-5 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-6">
      <MetricMiniComic metricName={metric.name} />
      <div className="min-w-0 border-l-2 border-[#12BFD0] pl-4">
        <p className="cr-meta font-semibold text-[#176BFF] dark:text-[#78A8F8]">What this measures</p>
        <p className="mt-1.5 text-[0.9375rem] font-semibold leading-6 text-[var(--cr-ink)]">{copy.summary}</p>
        {copy.caution && (
          <p className="mt-2 text-xs leading-5 text-[var(--cr-ink-2)]">
            <span className="font-semibold text-[#A82E43] dark:text-[#FFD0D7]">Keep in mind.</span>{' '}
            {copy.caution.lead}
            {copy.caution.emphasis}
            {copy.caution.tail}
          </p>
        )}
        {copy.runtime && (
          <p className="mt-2 text-xs leading-5 text-[var(--cr-ink-2)]">
            <span className="font-semibold text-[#176BFF] dark:text-[#78A8F8]">Runtime.</span>{' '}
            {copy.runtime}
          </p>
        )}
      </div>
    </section>
  );
};
