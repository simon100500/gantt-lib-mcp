import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import JSZip from 'jszip';

async function buildFixtureBase64(): Promise<string> {
  const zip = new JSZip();
  zip.file('Properties.txt', 'DocType=sdtSmeta');
  zip.file('Data.sign', 'signature');
  zip.file('Data.xml', `<?xml version="1.0" encoding="windows-1251"?>
<Document Generator="GrandSmeta">
  <Properties Description="Test estimate"/>
  <DocDates CreationDate="05.05.2026"/>
  <Chapters>
    <Chapter Caption="Section 1">
      <Header Caption="Group A"/>
      <Position Caption="Task 1" Number="1" Code="GESN01-01-001-01" Units="m2" Identifier="F1">
        <Quantity Result="12,5"/>
        <Resources>
          <Mat Caption="Material from work" Identifier="r1" Code="01.1.01.01" Units="m2" Quantity="12,5"/>
        </Resources>
      </Position>
      <Position Caption="Catalog material" Number="2" Code="FSBC-01.1.01.01-0001" Units="m2">
        <Quantity Fx="F1.r1" Result="12,5"/>
      </Position>
      <Position Caption="Task 2" Number="3" Code="GESN01-01-001-02" Units="pcs">
        <Quantity Result="3"/>
      </Position>
    </Chapter>
    <Chapter Caption="Section 2">
      <Position Caption="Task 3" Number="4" Code="47-1" Units="m3">
        <Quantity Result="7,25"/>
      </Position>
    </Chapter>
  </Chapters>
</Document>`);
  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  return buffer.toString('base64');
}

describe('grand smeta import preview', () => {
  it('parses gsfx into grouped task preview with generated dates', async () => {
    const { buildGrandSmetaImportPreview } = await import(new URL('./grand-smeta-import.ts', import.meta.url).href);
    const preview = await buildGrandSmetaImportPreview({
      fileName: 'fixture.gsfx',
      fileBase64: await buildFixtureBase64(),
    });

    assert.equal(preview.sheetName, 'Test estimate');
    assert.equal(preview.summary.taskCount, 6);
    assert.equal(preview.rows[0]?.normalized.name, 'Section 1');
    assert.equal(preview.rows[1]?.normalized.name, 'Group A');
    assert.equal(preview.rows[2]?.normalized.name, '1. Task 1');
    assert.equal(preview.rows[2]?.values.startDate, '2026-05-05');
    assert.equal(preview.rows[3]?.values.startDate, '2026-05-06');
    assert.equal(preview.rows[4]?.normalized.name, 'Section 2');
    assert.equal(preview.rows[5]?.values.startDate, '2026-05-07');
    assert.equal(preview.rows[5]?.values.workVolume, '7.25');
    assert.match(preview.issues[0]?.message ?? '', /GSFX не содержит календарных дат/u);
    assert.ok(preview.rows.every((row) => row.normalized.name !== '2. Catalog material'));
    assert.match(preview.issues[1]?.message ?? '', /Материальные позиции/u);
  });
});
