FROM node:24-alpine

WORKDIR /app
COPY --chown=node:node . .

# Writable data folder for ghost rides and highscores (named volumes inherit this ownership)
RUN mkdir -p /data && chown node:node /data

ENV PORT=8000 \
    GHOSTRIDES_DIR=/data/ghostrides \
    ESCARGOZZLED_SCORES_FILE=/data/scores.json \
    LOOP_KICKER_SCORES_FILE=/data/loop-kicker-journey-scores.json

VOLUME /data
EXPOSE 8000
USER node
CMD ["sh", "/app/docker-start.sh"]
