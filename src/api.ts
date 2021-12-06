import {ValidatedData, UploadedFile, ErrorSelected, UploadMetadata} from './types';
import {public_key} from "./helpers/postcodeSignature";
import {captureException} from "./helpers/sentry";
import dayjs from "dayjs";
import {saveAs} from "file-saver";

const pyodideVersion = "0.18.1";

importScripts(`https://cdn.jsdelivr.net/pyodide/v${pyodideVersion}/full/pyodide.js`);

let pyodide: any;

export async function handleUploaded903Data(uploadedFiles: Array<UploadedFile>, selectedErrors: Array<ErrorSelected>, metadata: UploadMetadata): Promise<[ValidatedData, Array<any>]> {
  console.log('Passing uploaded data to Pyodide...');
  pyodide.globals.set("uploaded_files", uploadedFiles);
  pyodide.globals.set("error_codes", selectedErrors.filter(e => e.selected).map(({ code }) => code));
  pyodide.globals.set("metadata", metadata);

  let uploadErrors = [];
  try {
      await pyodide.runPythonAsync(`
        from validator903.validator import Validator
        from validator903.report import Report
        from validator903.config import errors as configured_errors
        from dataclasses import asdict
        
        validator = Validator(metadata.to_py(), uploaded_files.to_py())
        result = validator.validate(error_codes.to_py())
        print("Finished Validating")
        
        report = Report(result)
        print("Created report")
        
        cr = report.child_report
        print("Child report generated")
        
        #js_files = {k: [t._asdict() for t in df.itertuples(index=True)] for k, df in validator.dfs.items()}
        js_files = {k: json.loads(df.to_json(orient='index')) for k, df in validator.dfs.items()}

        error_definitions = {code: asdict(definition[0]) for code, definition in configured_errors.items()}

        errors = {}
        for row in report.child_report.itertuples():
            errors.setdefault(row.Table, {}).setdefault(row.RowID, []).append(row.Code)
            
        validation_result = json.dumps(dict(data=js_files, errors=errors, errorDefinitions=error_definitions))
      `);
  } catch (error) {
      console.error('Caught Error!', error)
      const pythonError = (error as Error).toString()
      captureException(error, {pythonError})
      const errorLines = pythonError.split('\n') // We need to take the second to last line to get the exception text.
      uploadErrors.push(errorLines[errorLines.length - 2]);
  }

  // const data = pyodide.globals.get("js_files")?.toJs();
  // const errors = pyodide.globals.get("errors")?.toJs();
  // const errorDefinitions = pyodide.globals.get("error_definitions")?.toJs();
  const validationResult = pyodide.globals.get("validation_result");

  console.log('Python calculation complete.', validationResult)

  return [JSON.parse(validationResult || "{}"), uploadErrors]
}

export async function workerLoadPyodide(id: bigint) {
  const setText = (text: string) => {
    postMessage({text, id, type: 'TEXT'})
  }
  if (!pyodide?.runPython) {
    pyodide = await loadPyodide({ indexURL: `https://cdn.jsdelivr.net/pyodide/v${pyodideVersion}/full/` });
    setText("Loading standard libraries...");
    await pyodide.loadPackage(['micropip']);

    pyodide.globals.set("pc_pubkey", public_key);
    await pyodide.runPythonAsync(`
      import os
      os.environ["QLACREF_PC_KEY"] = pc_pubkey
    `);

    setText("Loading rule engine...")
    if (process.env.REACT_APP_MICROPIP_MODULES) {
      const extra_modules = process.env.REACT_APP_MICROPIP_MODULES.split(" ")
      pyodide.globals.set("micropip_extra_modules", extra_modules);
    }

    await pyodide.runPythonAsync(`
      import micropip
      import logging
      logging.basicConfig(level=logging.INFO)
     
      await micropip.install('${process.env.REACT_APP_VALIDATOR_RELEASE}')

      try:
        for mod in micropip_extra_modules:
          print(f"Loading extra module from: {mod}")
          await micropip.install(mod)
      except NameError:
        pass
    `);
    console.log('Loaded custom libary.');
  } else {
    console.log('Pyodide already loaded.');
  }
}

export async function loadErrorDefinitions(): Promise<Array<ErrorSelected>> {
  await pyodide.runPythonAsync(`
    from validator903.config import errors as configured_errors
    import json
    all_error_definitions = [definition[0] for definition in configured_errors.values()]
    all_error_definitions = [{
      'code': e.code,
      'description': e.description,
      'affectedFields': e.affected_fields,
      'selected': True,
    } for e in all_error_definitions]
    all_error_definitions = json.dumps(all_error_definitions)
  `);
  return JSON.parse(pyodide.globals.get("all_error_definitions"));
}


export const saveErrorSummary = async (report_type: string) => {
  const time = dayjs().format('YYYYMMDD-HHmmss')
  const report_name = report_type === "ChildErrorSummary" ? 'children' : 'errors';
  try {
    const report = pyodide.globals.get("report");
    const report_data = report.csv_report(report_name);
    let errorSummaryContent = new Blob([report_data],
        {type: 'text/csv'});
    report.destroy()
    saveAs(errorSummaryContent, `${report_type}-${time}.csv`);
  } catch (error) {
    console.error('Caught Error!', error)
    const pythonError = (error as Error).toString()
    captureException(error, {pythonError})
  }
}

export const saveExcelSummary = async () => {
  const time = dayjs().format('YYYYMMDD-HHmmss')
  try {
    const report = pyodide.globals.get("report");
    const report_data = report.excel_report()
    let errorSummaryContent = new Blob([report_data.toJs],
        {type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    report.destroy()
    report_data.destroy()
    saveAs(errorSummaryContent, `ErrorReport-${time}.xlsx`);
  } catch (error) {
    console.error('Caught Error!', error)
    const pythonError = (error as Error).toString()
    captureException(error, {pythonError})
  }
}

