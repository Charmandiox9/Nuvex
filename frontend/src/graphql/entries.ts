export const entryFields = 'id parentId name kind mime size mediaStatus hasPreview hasIcon updatedAt trashedAt';

export const driveQuery = `query Drive($view:String!,$parentId:String!,$search:String!,$sort:String!,$cursor:String,$kind:String,$mimePrefix:String,$minSize:String,$maxSize:String,$from:String,$to:String){entries(view:$view,parentId:$parentId,search:$search,sort:$sort,cursor:$cursor,kind:$kind,mimePrefix:$mimePrefix,minSize:$minSize,maxSize:$maxSize,from:$from,to:$to){nextCursor items{${entryFields}}}}`;

export const previewQuery = `query Preview($id:String!){entry(id:$id){${entryFields}}}`;

export const destinationQuery = `query Destination($id:String!,$cursor:String){entries(parentId:$id,cursor:$cursor){nextCursor items{${entryFields}}}}`;
