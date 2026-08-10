// NFC Handler
class NFCHandler {
    constructor() {
        this.reader = null;
        this.writer = null;
        this.isReading = false;
        this.onRead = null;
        this.onError = null;
    }

    // Initialize NFC
    async init() {
        if (!('NDEFReader' in window)) {
            throw new Error('NFC not supported on this device');
        }
        this.reader = new NDEFReader();
        this.writer = new NDEFReader();
    }

    // Start reading NFC tags
    async startReading(onRead, onError) {
        if (!this.reader) await this.init();
        
        this.onRead = onRead;
        this.onError = onError;
        this.isReading = true;

        try {
            await this.reader.scan();
            
            this.reader.addEventListener('reading', (event) => {
                if (this.onRead) {
                    const data = {
                        uid: event.serialNumber,
                        records: []
                    };

                    // Parse NDEF records
                    if (event.message && event.message.records) {
                        for (const record of event.message.records) {
                            if (record.recordType === 'text') {
                                const decoder = new TextDecoder(record.encoding || 'utf-8');
                                data.records.push({
                                    type: 'text',
                                    value: decoder.decode(record.data)
                                });
                            } else if (record.recordType === 'url') {
                                const decoder = new TextDecoder();
                                data.records.push({
                                    type: 'url',
                                    value: decoder.decode(record.data)
                                });
                            }
                        }
                    }

                    this.onRead(data);
                }
            });

            this.reader.addEventListener('readingerror', (event) => {
                if (this.onError) {
                    this.onError(new Error('Error reading NFC tag'));
                }
            });

            return true;
        } catch (error) {
            if (this.onError) {
                this.onError(error);
            }
            throw error;
        }
    }

    // Stop reading
    stopReading() {
        this.isReading = false;
        // Note: Web NFC doesn't have a direct stop method
        // The reading continues until the page is closed
    }

    // Write WCA ID to NFC tag
    async writeWCAId(wcaId) {
        if (!this.writer) await this.init();

        try {
            await this.writer.write({
                records: [
                    {
                        recordType: 'text',
                        data: wcaId,
                        encoding: 'utf-8'
                    }
                ]
            });
            return true;
        } catch (error) {
            throw error;
        }
    }

    // Write competitor data to NFC tag
    async writeCompetitor(wcaId, name) {
        if (!this.writer) await this.init();

        try {
            await this.writer.write({
                records: [
                    {
                        recordType: 'text',
                        data: `WCA:${wcaId}`,
                        encoding: 'utf-8'
                    },
                    {
                        recordType: 'text',
                        data: `NAME:${name}`,
                        encoding: 'utf-8'
                    }
                ]
            });
            return true;
        } catch (error) {
            throw error;
        }
    }
}

// Global NFC instance
const nfc = new NFCHandler();