import Soup from 'gi://Soup?version=3.0';
import Gio from 'gi://Gio';

export function httpClient(context) {
    const session = new Soup.Session({timeout: 15, user_agent: 'LunaDesktop-Widgets/1.0'});
    const cancellable = new Gio.Cancellable();
    context.onDispose(() => { cancellable.cancel(); session.abort(); });
    const bytes = url => new Promise((resolve, reject) => {
        const message = Soup.Message.new('GET', url);
        if (!message) { reject(new Error('Invalid URL')); return; }
        session.send_and_read_async(message, 0, cancellable, (source, result) => {
            try {
                const data = source.send_and_read_finish(result);
                if (message.status_code !== 200) throw new Error(`HTTP ${message.status_code}`);
                resolve(data);
            } catch (error) { reject(error); }
        });
    });
    return {bytes, json: async url => JSON.parse(new TextDecoder().decode((await bytes(url)).get_data()))};
}
