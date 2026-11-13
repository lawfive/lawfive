// Copy a file into a folder on a USB-connected Garmin watch over MTP, replacing a file of the same
// name. libmtp's own mtp-sendfile can't resolve folders on the Venu 2, so this walks the folder path
// one level at a time and sends to the folder directly.
//
// Usage: mtpput <local file> <folder path on the watch, e.g. GARMIN/APPS> [other file names to remove there]
// Build: cc -O2 mtpput.c $(pkg-config --cflags --libs libmtp) -o mtpput

#include <libmtp.h>
#include <libgen.h>
#include <stdio.h>
#include <string.h>
#include <strings.h>
#include <sys/stat.h>

static void free_files(LIBMTP_file_t *files) {
    while (files != NULL) {
        LIBMTP_file_t *next = files->next;
        LIBMTP_destroy_file_t(files);
        files = next;
    }
}

// Id of the child folder called `name` (case-insensitive) under `parent`, or 0 if there is none.
static uint32_t find_folder(LIBMTP_mtpdevice_t *device, uint32_t storage, uint32_t parent, const char *name) {
    uint32_t id = 0;
    LIBMTP_file_t *files = LIBMTP_Get_Files_And_Folders(device, storage, parent);
    for (LIBMTP_file_t *f = files; f != NULL; f = f->next) {
        if (f->filetype == LIBMTP_FILETYPE_FOLDER && strcasecmp(f->filename, name) == 0) {
            id = f->item_id;
            break;
        }
    }
    free_files(files);
    return id;
}

int main(int argc, char **argv) {
    if (argc < 3) {
        fprintf(stderr, "usage: mtpput <local file> <folder path on the watch> [other file names to remove there]\n");
        return 2;
    }
    const char *local = argv[1];
    char path[1024];
    snprintf(path, sizeof path, "%s", argv[2]);
    char localCopy[1024];
    snprintf(localCopy, sizeof localCopy, "%s", local);
    const char *name = basename(localCopy);

    struct stat st;
    if (stat(local, &st) != 0) {
        fprintf(stderr, "mtpput: %s not found\n", local);
        return 1;
    }

    LIBMTP_Init();
    // Uncached, so the file listing used to replace an old copy works.
    LIBMTP_raw_device_t *raw = NULL;
    int count = 0;
    LIBMTP_mtpdevice_t *device = NULL;
    if (LIBMTP_Detect_Raw_Devices(&raw, &count) == LIBMTP_ERROR_NONE && count > 0) {
        device = LIBMTP_Open_Raw_Device_Uncached(&raw[0]);
    }
    if (device == NULL) {
        fprintf(stderr, "mtpput: no watch found (is it plugged in, and OpenMTP / Garmin Express closed?)\n");
        return 1;
    }

    int status = 1;
    LIBMTP_devicestorage_t *storage;
    for (storage = device->storage; storage != NULL && status != 0; storage = storage->next) {
        uint32_t folder = LIBMTP_FILES_AND_FOLDERS_ROOT;
        for (char *part = strtok(path, "/"); part != NULL && folder != 0; part = strtok(NULL, "/")) {
            folder = find_folder(device, storage->id, folder, part);
        }
        snprintf(path, sizeof path, "%s", argv[2]);
        if (folder == 0 || folder == LIBMTP_FILES_AND_FOLDERS_ROOT) {
            continue;
        }

        // Replace an existing file with the same name, and remove any others named (an old name).
        LIBMTP_file_t *files = LIBMTP_Get_Files_And_Folders(device, storage->id, folder);
        for (LIBMTP_file_t *f = files; f != NULL; f = f->next) {
            if (f->filetype == LIBMTP_FILETYPE_FOLDER) {
                continue;
            }
            int remove = strcasecmp(f->filename, name) == 0;
            for (int i = 3; i < argc && !remove; i++) {
                remove = strcasecmp(f->filename, argv[i]) == 0;
            }
            if (remove) {
                if (LIBMTP_Delete_Object(device, f->item_id) != 0) {
                    fprintf(stderr, "mtpput: could not remove %s\n", f->filename);
                    LIBMTP_Dump_Errorstack(device);
                } else if (strcasecmp(f->filename, name) != 0) {
                    printf("Removed the old %s\n", f->filename);
                }
            }
        }
        free_files(files);

        LIBMTP_file_t *file = LIBMTP_new_file_t();
        file->filename = strdup(name);
        file->filesize = (uint64_t)st.st_size;
        file->filetype = LIBMTP_FILETYPE_UNKNOWN;
        file->parent_id = folder;
        file->storage_id = storage->id;
        if (LIBMTP_Send_File_From_File(device, local, file, NULL, NULL) == 0) {
            printf("Copied %s to %s on %s\n", name, argv[2], LIBMTP_Get_Modelname(device));
            status = 0;
        } else {
            fprintf(stderr, "mtpput: sending failed\n");
            LIBMTP_Dump_Errorstack(device);
        }
        LIBMTP_destroy_file_t(file);
        break;
    }
    if (status != 0 && storage == NULL) {
        fprintf(stderr, "mtpput: folder %s not found on the watch\n", argv[2]);
    }
    LIBMTP_Release_Device(device);
    return status;
}
