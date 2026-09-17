import { cwd } from 'node:process';
import { compose } from 'node:stream';
import { spec } from 'node:test/reporters';

const workingDirectory = cwd();

const redactLocalPaths = (value) => String(value)
  .replaceAll(`${workingDirectory}/`, '')
  .replaceAll(`${workingDirectory}\\`, '')
  .replace(/\/(?:home|Users)\/[A-Za-z0-9._-]+(?=\/)/g, '<user-home>')
  .replace(/[A-Za-z]:[\\/]+Users[\\/]+[^\\/\s]+(?=[\\/])/gi, '<user-home>');

export default async function* repoRelativeReporter(source) {
  for await (const chunk of compose(source, spec())) {
    yield redactLocalPaths(chunk);
  }
}
