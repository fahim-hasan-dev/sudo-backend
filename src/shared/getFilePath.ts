type IFolderName = 'image' | 'media' | 'resume' | 'companyLogo' | 'idDocumentFront' | 'idDocumentBack' | 'faceImage' | 'kyc';

const mapFolder = (folderName: string): string => {
    if (folderName === 'idDocumentFront' || folderName === 'idDocumentBack') {
        return 'kyc';
    }
    if (folderName === 'faceImage') {
        return 'image';
    }
    return folderName;
};

//single file
export const getSingleFilePath = (files: any, folderName: IFolderName) => {
    const fileField = files && files[folderName];
    if (fileField && Array.isArray(fileField) && fileField.length > 0) {
        const actualFolder = mapFolder(folderName);
        return `/${actualFolder}/${fileField[0].filename}`;
    }

    return undefined;
};

//multiple files
export const getMultipleFilesPath = (files: any, folderName: IFolderName) => {
    const folderFiles = files && files[folderName];
    if (folderFiles) {
        if (Array.isArray(folderFiles)) {
            const actualFolder = mapFolder(folderName);
            return folderFiles.map((file: any) => `/${actualFolder}/${file.filename}`);
        }
    }

    return undefined;
};
