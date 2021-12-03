/* eslint-disable import/no-webpack-loader-syntax */
import api from 'workerize-loader!../api';

const instance = api()
export const handleUploaded903Data = async (...args) => await instance.handleUploaded903Data(...args);
export const loadPyodide = async () => await instance.workerLoadPyodide();
export const loadErrorDefinitions = async () => await instance.loadErrorDefinitions();
export const saveErrorSummary = async (...args) => await instance.saveErrorSummary(...args);