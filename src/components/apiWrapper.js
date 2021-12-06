/* eslint-disable import/no-webpack-loader-syntax */
import api from 'workerize-loader!../api';

const instance = api()
const listeners = {};
instance.onmessage = msg => {
    Object.values(listeners).forEach(l => l(msg.data));
}

let call_id = 0;


export const handleUploaded903Data = async (...args) => await instance.handleUploaded903Data(...args);

export const loadPyodide = async (setText) => {
    const id = ++call_id;
    listeners[id] = msg => {
        if (setText && msg.type === 'TEXT' && msg.id === id) {
            setText(msg.text)
        }
    }
    const result = await instance.workerLoadPyodide(id);
    delete listeners[id];
    return result;
}

export const loadErrorDefinitions = async () => await instance.loadErrorDefinitions();

export const saveErrorSummary = async (...args) => await instance.saveErrorSummary(...args);

