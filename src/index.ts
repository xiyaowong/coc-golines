import cp from 'child_process';
import {
  DocumentFormattingEditProvider,
  executable,
  ExtensionContext,
  languages,
  Range,
  TextDocument,
  TextEdit,
  window,
  workspace,
} from 'coc.nvim';

class GolinesFormattingEditProvider implements DocumentFormattingEditProvider {
  constructor(private golinesPath: string, private golinesArgs: string[]) {}

  async formatCode(code: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const child = cp.spawn(this.golinesPath, this.golinesArgs);

      let output = '';
      child.stdout.on('data', (data) => {
        output += data.toString();
      });
      child.stdout.on('close', () => {
        resolve(output.trimEnd());
      });

      child.stderr.on('data', (data) => reject(data.toString()));
      child.on('err', () => reject('Failed to run golines'));

      child.stdin.write(code);
      child.stdin.end();
    });
  }

  public async provideDocumentFormattingEdits(document: TextDocument): Promise<TextEdit[]> {
    const code = document.getText();
    let newCode: string;
    try {
      newCode = await this.formatCode(code);
    } catch (e) {
      window.showErrorMessage(`${e}`);
      return [];
    }

    const doc = workspace.getDocument(document.uri);
    const lastLine = doc.lineCount - 1;
    return [
      TextEdit.replace(
        Range.create({ character: 0, line: 0 }, { character: doc.getline(lastLine).length, line: lastLine }),
        newCode
      ),
    ];
  }
}

export async function activate(context: ExtensionContext) {
  const config = workspace.getConfiguration('golines');
  const path = config.get<string>('path', 'golines');

  if (!executable(path)) {
    window.showErrorMessage(`${path} is not executable`);
    return;
  }

  const args = config.get<string[]>('args', []);

  const golinesFormattingEditProvider = new GolinesFormattingEditProvider(path, args);

  context.subscriptions.push(
    languages.registerDocumentFormatProvider(
      [
        {
          scheme: 'file',
          language: 'go',
        },
      ],
      golinesFormattingEditProvider,
      999
    )
  );
}
