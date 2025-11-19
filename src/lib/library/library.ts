type metadata = {
    
}

export const getMetaData = (imdbId: string) => {
    const metaUrl = `https://v3-cinemeta.strem.io/meta/series/${imdbId}.json`

    return fetch(metaUrl).then((res) => res.json())
}