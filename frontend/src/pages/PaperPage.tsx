import React from 'react';
import { FileText, Github, Database, Play } from 'lucide-react';

export const PaperPage: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto space-y-12 py-8">
      {/* Title Section */}
      <section className="text-center space-y-6">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900 dark:text-white leading-tight">
          CounselReflect: <br className="hidden md:block" />
          Automated Evaluation for Counseling Dialogues
        </h1>
        
        <div className="flex flex-wrap justify-center gap-4 text-lg text-indigo-600 dark:text-indigo-400 font-medium">
          <span>Author Name<sup>1</sup></span>
          <span>Author Name<sup>2</sup></span>
          <span>Author Name<sup>1,2</sup></span>
        </div>

        <div className="flex justify-center gap-6 text-sm text-slate-600 dark:text-slate-400">
          <span><sup>1</sup>Institution One</span>
          <span><sup>2</sup>Institution Two</span>
        </div>

        {/* Links/Buttons */}
        <div className="flex flex-wrap justify-center gap-4 pt-4">
          <a href="#" className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-slate-900 text-white hover:bg-slate-800 transition-colors">
            <FileText size={18} />
            <span>Paper</span>
          </a>
          <a href="#" className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-slate-900 text-white hover:bg-slate-800 transition-colors">
            <FileText size={18} />
            <span>arXiv</span>
          </a>
          <a href="#" className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-slate-900 text-white hover:bg-slate-800 transition-colors">
            <Play size={18} />
            <span>Video</span>
          </a>
          <a href="#" className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-slate-900 text-white hover:bg-slate-800 transition-colors">
            <Github size={18} />
            <span>Code</span>
          </a>
          <a href="#" className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-slate-900 text-white hover:bg-slate-800 transition-colors">
            <Database size={18} />
            <span>Data</span>
          </a>
        </div>
      </section>

      {/* Teaser Video/Image Placeholder */}
      <section className="rounded-2xl overflow-hidden shadow-xl border border-slate-200 dark:border-slate-800">
        <div className="aspect-video bg-slate-100 dark:bg-slate-900 flex items-center justify-center text-slate-400">
          <p>Teaser Video / Image Placeholder</p>
        </div>
        <div className="p-6 bg-slate-50 dark:bg-slate-800/50">
          <p className="text-center text-slate-700 dark:text-slate-300 font-medium italic">
            CounselReflect enables analyzing therapeutic conversations...
          </p>
        </div>
      </section>

      {/* Abstract */}
      <section className="space-y-4">
        <h2 className="text-3xl font-bold text-center text-slate-900 dark:text-white">Abstract</h2>
        <div className="prose prose-lg dark:prose-invert mx-auto text-justify text-slate-600 dark:text-slate-300">
          <p>
            We present CounselReflect, a framework for evaluating counseling dialogues. 
            Evaluating the quality of therapeutic conversations is challenging due to the subjective nature of human communication 
            and the specific clinical requirements of effective therapy.
          </p>
          <p>
            Our approach leverages large language models to assess conversations based on established psychological frameworks. 
            We introduce a set of comprehensive metrics that cover empathy, goal alignment, and safety. 
            We demonstrate that our automated evaluation aligns closely with expert human ratings.
          </p>
        </div>
      </section>

      {/* Method / Pipeline Diagram Placeholder */}
      <section className="space-y-6">
        <h2 className="text-3xl font-bold text-center text-slate-900 dark:text-white">Method</h2>
        <p className="text-center text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
          Our system processes the conversation through a multi-stage pipeline, extracting key features and applying domain-specific evaluation metrics.
        </p>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-8 bg-white dark:bg-slate-900">
          <div className="h-64 flex items-center justify-center border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800/50">
            <span className="text-slate-400 font-medium">Pipeline Architecture Diagram</span>
          </div>
        </div>
      </section>

      {/* BibTeX */}
      <section className="space-y-4">
        <h2 className="text-3xl font-bold text-center text-slate-900 dark:text-white">BibTeX</h2>
        <div className="bg-slate-100 dark:bg-slate-900 rounded-lg p-6 overflow-x-auto border border-slate-200 dark:border-slate-800">
          <pre className="text-sm text-slate-800 dark:text-slate-200 font-mono whitespace-pre">
{`@article{author2024counselreflect,
  author    = {Author, Name and Author, Name},
  title     = {CounselReflect: Automated Evaluation for Counseling Dialogues},
  journal   = {Conference Name},
  year      = {2024},
}`}
          </pre>
        </div>
      </section>
    </div>
  );
};
