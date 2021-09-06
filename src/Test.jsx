import React, {useState} from 'react';

function sayHello() {}



function Test() {
    const [desi, setDesi] = useState(1);

    const clickHandler = () => {
        setDesi(desi+2);
    }

    return (
        <>
            <div>{desi}</div>
            <button onClick={clickHandler}>Click me</button>
        </>
    )
}

export default Test;