import gcoord from "gcoord";
export  function gcoordType( type : string ){
    let gcType;
    switch( type) {
        case "WGS84":
            gcType = gcoord.WGS84;
            break;
        case "GCJ02":
            gcType = gcoord.GCJ02;
            break;
        case "BD09":
            gcType = gcoord.BD09;
            break;
    }
    return gcType;
}