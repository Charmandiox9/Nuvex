export const entryFields = 'id parentId name kind mime size mediaStatus hasPreview updatedAt trashedAt';

export const driveQuery = `query Drive($view:String!,$parentId:String!,$search:String!,$sort:String!,$cursor:String){entries(view:$view,parentId:$parentId,search:$search,sort:$sort,cursor:$cursor){nextCursor items{${entryFields}}}}`;

export const previewQuery = `query Preview($id:String!){entry(id:$id){${entryFields}}}`;

export const destinationQuery = `query Destination($id:String!,$cursor:String){entries(parentId:$id,cursor:$cursor){nextCursor items{${entryFields}}}}`;
