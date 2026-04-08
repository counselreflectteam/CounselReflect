/**
 * Export utilities for downloading evaluation results
 */

/**
 * Download results as JSON file
 */
export const downloadJSON = (results: any) => {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(results, null, 2));
  const downloadAnchorNode = document.createElement('a');
  downloadAnchorNode.setAttribute("href", dataStr);
  downloadAnchorNode.setAttribute("download", "evaluation_results.json");
  document.body.appendChild(downloadAnchorNode);
  downloadAnchorNode.click();
  downloadAnchorNode.remove();
};

/**
 * Download results as CSV file
 */
export const downloadCSV = (
  results: any,
  conversation: any,
  metricNames: string[],
  metricLabelMap: Record<string, string>
) => {
  const headers = [
    "Turn", 
    "Role", 
    "Content", 
    ...metricNames.map(name => `${metricLabelMap[name] || name} (Score/Label)`), 
    ...metricNames.map(name => `${metricLabelMap[name] || name} (Reasoning)`)
  ];
  let csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n";

  results.utteranceScores.forEach((u: any, idx: number) => {
    const msg = conversation.messages.find((m: any) => m.id === u.messageId);
    const row = [
      idx + 1,
      msg?.role || 'N/A',
      `"${(msg?.content || '').replace(/"/g, '""')}"`,
      ...metricNames.map(name => {
        const s = u.metrics[name];
        if (!s) return '';
        return s.type === 'numerical' ? s.value : s.label;
      }),
      ...metricNames.map(name => `"${(u.reasoning?.[name] || '').replace(/"/g, '""')}"`)
    ];
    csvContent += row.join(",") + "\n";
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", "evaluation_results.csv");
  document.body.appendChild(link);
  link.click();
  link.remove();
};
